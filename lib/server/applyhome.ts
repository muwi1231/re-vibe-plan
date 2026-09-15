import "server-only";

import { unstable_cache } from "next/cache";
import {
  SOURCE,
  competitionFromData,
  houseTypesFromData,
  noticesFromData,
  yearsAgo,
  type Notice,
  type NoticeDetail,
} from "../market.ts";
import { CACHE_ONE_DAY, PublicDataError, requestPublicData, todayKst } from "./datago.ts";

/** 기술문서: 청약홈 분양정보 조회 서비스 */
const INFO_BASE = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1";
/** 기술문서: 청약홈 청약접수 경쟁률 및 특별공급 신청현황 조회 서비스 */
const COMPETITION_BASE = "https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1";

const PER_PAGE = 100;
const MAX_PAGES = 20;

type OdcloudPage = { data?: Record<string, unknown>[]; matchCount?: number };

/** 청약홈(odcloud) 조회를 모든 페이지에 걸쳐 받는다. */
async function fetchAllData(
  endpoint: string,
  label: string,
  conditions: [string, string][],
): Promise<Record<string, unknown>[]> {
  const data: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const text = await requestPublicData(
      endpoint,
      [["page", String(page)], ["perPage", String(PER_PAGE)], ...conditions],
      "serviceKey",
    );
    let body: OdcloudPage;
    try {
      body = JSON.parse(text) as OdcloudPage;
    } catch {
      throw new PublicDataError(`${label}: 응답 형식을 해석하지 못했습니다.`);
    }
    if (!Array.isArray(body.data)) throw new PublicDataError(`${label}: 응답에 data가 없습니다.`);
    data.push(...body.data);
    if (page * PER_PAGE >= (body.matchCount ?? 0)) break;
  }
  return data;
}

export type SubscriptionList = {
  /** APT 분양 공고 (최근 3년, 공급위치 LIKE 시군구) */
  notices: Notice[];
  /** APT 잔여세대 공고 (같은 조건) */
  remainders: Notice[];
  since: string;
  rawCount: number;
  excluded: { reason: string; count: number }[];
  fetchedAt: string;
  source: string;
};

/** 공급위치 LIKE 시군구 · 모집공고일 최근 3년으로 APT 분양·잔여세대 공고를 조회한다. (하루 캐시) */
export const fetchSubscriptionList = unstable_cache(
  async (sido: string, sigungu: string, today: string): Promise<SubscriptionList> => {
    const since = yearsAgo(today, 3);
    const conditions: [string, string][] = [
      ["cond[HSSPLY_ADRES::LIKE]", sigungu || sido],
      ["cond[RCRIT_PBLANC_DE::GTE]", since],
    ];
    const [aptData, remainderData] = await Promise.all([
      fetchAllData(`${INFO_BASE}/getAPTLttotPblancDetail`, "APT 분양정보", conditions),
      fetchAllData(`${INFO_BASE}/getRemndrLttotPblancDetail`, "APT 잔여세대", conditions),
    ]);
    const apt = noticesFromData(aptData, sido);
    const remainder = noticesFromData(remainderData, sido);
    return {
      notices: apt.notices,
      remainders: remainder.notices,
      since,
      rawCount: aptData.length + remainderData.length,
      excluded: [{ reason: `공급위치 시도가 ${sido}와 다른 공고`, count: apt.otherSido + remainder.otherSido }],
      fetchedAt: todayKst(),
      source: SOURCE.applyhomeInfo,
    };
  },
  ["applyhome-subscription-v1"],
  { revalidate: CACHE_ONE_DAY },
);

/** 공고 한 건의 주택형별 분양가와 경쟁률을 조회한다. (하루 캐시) */
export const fetchNoticeDetail = unstable_cache(
  async (houseManageNo: string, pblancNo: string): Promise<NoticeDetail> => {
    const conditions: [string, string][] = [
      ["cond[HOUSE_MANAGE_NO::EQ]", houseManageNo],
      ["cond[PBLANC_NO::EQ]", pblancNo],
    ];
    const [typeData, competitionData] = await Promise.all([
      fetchAllData(`${INFO_BASE}/getAPTLttotPblancMdl`, "주택형별 분양가", conditions),
      fetchAllData(`${COMPETITION_BASE}/getAPTLttotPblancCmpet`, "청약 경쟁률", conditions),
    ]);
    return {
      houseManageNo,
      pblancNo,
      types: houseTypesFromData(typeData),
      competition: competitionFromData(competitionData),
      fetchedAt: todayKst(),
    };
  },
  ["applyhome-detail-v1"],
  { revalidate: CACHE_ONE_DAY },
);
