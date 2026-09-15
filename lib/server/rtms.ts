import "server-only";

import { unstable_cache } from "next/cache";
import {
  SOURCE,
  parseXmlRecords,
  presaleDealsFromRows,
  rentDealsFromRows,
  rtmsHeader,
  type PresaleDeal,
  type RentDeal,
} from "../market.ts";
import { CACHE_ONE_DAY, PublicDataError, requestPublicData, todayKst } from "./datago.ts";

/** 기술문서: 아파트 분양권전매 실거래가 자료 · getRTMSDataSvcSilvTrade */
const PRESALE_ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade";
/** 기술문서: 아파트 전월세 실거래가 자료 · getRTMSDataSvcAptRent */
const RENT_ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent";

/** 한 번에 받을 행 수와 최대 페이지 */
const ROWS_PER_PAGE = 1000;
const MAX_PAGES = 10;

/** 지역코드·계약월 한 달치 item을 모든 페이지에 걸쳐 받는다. */
async function fetchAllItems(
  endpoint: string,
  label: string,
  lawdCode: string,
  ym: string,
): Promise<{ rows: Record<string, string>[]; totalCount: number }> {
  const rows: Record<string, string>[] = [];
  let totalCount = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const xml = await requestPublicData(
      endpoint,
      [
        ["LAWD_CD", lawdCode],
        ["DEAL_YMD", ym],
        ["pageNo", String(page)],
        ["numOfRows", String(ROWS_PER_PAGE)],
      ],
      "serviceKey",
    );
    const header = rtmsHeader(xml);
    if (header.error) throw new PublicDataError(`${label}: ${header.error}`);
    totalCount = header.totalCount;
    rows.push(...parseXmlRecords(xml, "item"));
    if (page * ROWS_PER_PAGE >= totalCount) break;
  }
  return { rows, totalCount };
}

export type PresaleMonth = {
  ym: string;
  deals: PresaleDeal[];
  rawCount: number;
  excluded: { reason: string; count: number }[];
  fetchedAt: string;
  source: string;
};

/** 분양권전매 한 달치 (해제 거래 제외, 하루 캐시) */
export const fetchPresaleMonth = unstable_cache(
  async (lawdCode: string, ym: string): Promise<PresaleMonth> => {
    const { rows, totalCount } = await fetchAllItems(PRESALE_ENDPOINT, "분양권전매", lawdCode, ym);
    const { deals, canceled, invalid } = presaleDealsFromRows(rows);
    return {
      ym,
      deals,
      rawCount: totalCount,
      excluded: [
        { reason: "해제 거래", count: canceled },
        { reason: "필수값 누락", count: invalid },
      ],
      fetchedAt: todayKst(),
      source: SOURCE.presale,
    };
  },
  ["rtms-presale-v1"],
  { revalidate: CACHE_ONE_DAY },
);

export type RentMonth = {
  ym: string;
  deals: RentDeal[];
  rawCount: number;
  excluded: { reason: string; count: number }[];
  fetchedAt: string;
  source: string;
};

/** 전월세 한 달치 (하루 캐시). 기술문서에 해제여부 항목이 없어 해제 제외는 적용할 수 없다. */
export const fetchRentMonth = unstable_cache(
  async (lawdCode: string, ym: string): Promise<RentMonth> => {
    const { rows, totalCount } = await fetchAllItems(RENT_ENDPOINT, "전월세", lawdCode, ym);
    const { deals, invalid } = rentDealsFromRows(rows);
    return {
      ym,
      deals,
      rawCount: totalCount,
      excluded: [
        { reason: "해제 거래 (기술문서에 해제여부 항목 없음 — 적용 불가)", count: 0 },
        { reason: "필수값 누락", count: invalid },
      ],
      fetchedAt: todayKst(),
      source: SOURCE.rent,
    };
  },
  ["rtms-rent-v1"],
  { revalidate: CACHE_ONE_DAY },
);
