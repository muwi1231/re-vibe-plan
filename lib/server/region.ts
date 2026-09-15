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
  /** 입력한 사업대상지 주소 (공백 정리) */
  area: string;
  /** 주소가 속한 시군구 */
  matched: RegionCandidate | null;
  /** 시군구를 못 찾았을 때 고를 수 있는 후보 */
  candidates: RegionCandidate[];
  fetchedAt: string;
};

/**
 * 사업대상지 주소를 법정동코드 시군구로 확인한다. 읍면동·지번까지 적어도 된다.
 * 형식이 틀리면 400.
 */
export async function lookupRegion(areaText: string): Promise<RegionLookup> {
  const parts = splitArea(areaText);
  if (!parts) {
    throw new PublicDataError("사업대상지는 시도 전체 이름과 시군구를 함께 입력하세요.", 400);
  }
  const area = `${parts.sido} ${parts.sigungu}`;
  const firstName = parts.sigungu.split(" ")[0];

  // "시도 + 시군구 첫 이름"으로 조회하면 그 아래 구·읍면동 행까지 함께 온다.
  const scoped = await fetchRegionCandidates(`${parts.sido} ${firstName}`);
  let matched = pickRegion(scoped.candidates, area);
  let fetchedAt = scoped.fetchedAt;

  // 세종특별자치시는 시도 자체가 시군구 단위다.
  if (!matched && parts.sido === "세종특별자치시") {
    const sido = await fetchRegionCandidates(parts.sido);
    matched = pickRegion(sido.candidates, area);
    fetchedAt = sido.fetchedAt;
  }
  if (matched) return { area, matched, candidates: [], fetchedAt };

  // 못 찾으면 시군구 첫 이름으로 전국에서 넓혀 후보를 보여준다.
  const loose = await fetchRegionCandidates(firstName);
  const seen = new Set<string>();
  const candidates = [...scoped.candidates, ...loose.candidates]
    .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    .slice(0, 20);
  return { area, matched: null, candidates, fetchedAt: loose.fetchedAt };
}

/** 시장 분석 라우트용: 주소가 속한 시군구를 확인하고, 없으면 404. sido·sigungu는 확인된 시군구 이름 기준. */
export async function requireRegion(
  areaText: string,
): Promise<{ area: string; sido: string; sigungu: string; region: RegionCandidate }> {
  const lookup = await lookupRegion(areaText);
  if (!lookup.matched) {
    throw new PublicDataError(`법정동코드에서 '${lookup.area}'가 속한 시군구를 찾지 못했습니다.`, 404);
  }
  const name = lookup.matched.name;
  const parts = splitArea(name) ?? { sido: name, sigungu: "" };
  return { area: name, ...parts, region: lookup.matched };
}
