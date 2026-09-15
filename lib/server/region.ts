import "server-only";

import { unstable_cache } from "next/cache";
import {
  legalDongHeader,
  parseXmlRecords,
  pickRegion,
  regionCandidatesFromRows,
  splitArea,
  type RegionCandidate,
} from "../market.ts";
import { CACHE_30_DAYS, PublicDataError, requestPublicData, todayKst } from "./datago.ts";

/** 기술문서: 행정안전부_행정표준코드_법정동코드 · getStanReginCdList */
const LEGAL_DONG_ENDPOINT = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList";

/** 지역주소명으로 법정동코드 시군구 후보를 조회한다. (30일 캐시) */
const fetchRegionCandidates = unstable_cache(
  async (locationName: string): Promise<{ candidates: RegionCandidate[]; fetchedAt: string }> => {
    const candidates: RegionCandidate[] = [];
    const perPage = 1000;
    for (let page = 1; page <= 5; page++) {
      const xml = await requestPublicData(
        LEGAL_DONG_ENDPOINT,
        [
          ["type", "xml"],
          ["pageNo", String(page)],
          ["numOfRows", String(perPage)],
          ["flag", "Y"],
          ["locatadd_nm", locationName],
        ],
        "ServiceKey",
      );
      const header = legalDongHeader(xml);
      if (header.error) throw new PublicDataError(`법정동코드: ${header.error}`);
      candidates.push(...regionCandidatesFromRows(parseXmlRecords(xml, "row")));
      if (page * perPage >= header.totalCount) break;
    }
    return { candidates, fetchedAt: todayKst() };
  },
  ["legal-dong-candidates-v1"],
  { revalidate: CACHE_30_DAYS },
);

export type RegionLookup = {
  area: string;
  matched: RegionCandidate | null;
  /** 정확히 맞는 지역이 없을 때 고를 수 있는 시군구 후보 */
  candidates: RegionCandidate[];
  fetchedAt: string;
};

/** 사업대상지 이름을 법정동코드로 확인한다. 이름 형식이 틀리면 400. */
export async function lookupRegion(areaText: string): Promise<RegionLookup> {
  const parts = splitArea(areaText);
  if (!parts) {
    throw new PublicDataError("사업대상지는 시도 전체 이름과 시군구를 함께 입력하세요.", 400);
  }
  const area = `${parts.sido} ${parts.sigungu}`;
  const exact = await fetchRegionCandidates(area);
  const matched = pickRegion(exact.candidates, area);
  if (matched) return { area, matched, candidates: [], fetchedAt: exact.fetchedAt };

  // 못 찾으면 시군구 마지막 이름으로 넓혀 후보를 보여준다.
  const lastName = parts.sigungu.split(" ").pop()!;
  const loose = await fetchRegionCandidates(lastName);
  const seen = new Set<string>();
  const candidates = [...exact.candidates, ...loose.candidates]
    .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    .slice(0, 20);
  return { area, matched: null, candidates, fetchedAt: loose.fetchedAt };
}

/** 시장 분석 라우트용: 지역을 확인하고, 없으면 404. */
export async function requireRegion(
  areaText: string,
): Promise<{ area: string; sido: string; sigungu: string; region: RegionCandidate }> {
  const lookup = await lookupRegion(areaText);
  if (!lookup.matched) {
    throw new PublicDataError(`법정동코드에서 '${lookup.area}'를 찾지 못했습니다.`, 404);
  }
  const parts = splitArea(lookup.area)!;
  return { area: lookup.area, ...parts, region: lookup.matched };
}
