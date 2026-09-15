/**
 * 시장 분석 — 공공데이터 응답 정리와 네 개의 표.
 *
 * 이 파일은 순수 함수만 둔다. 네트워크 호출·인증키는 lib/server/ 에서만 다룬다.
 * 필드명은 api_docs 기술문서의 응답 명세를 그대로 따른다.
 *
 * 단위: 금액은 공공데이터 원 단위인 만원, 면적은 ㎡ (평 환산은 PYEONG_PER_M2).
 */

import { BAND_84, PYEONG_PER_M2, SIDO_NAMES, isBand84 } from "./calc.ts";

// ─────────────────────────────────────────────────────────────
// 공통
// ─────────────────────────────────────────────────────────────

/** 표·차트 아래에 붙일 조회 정보 */
export type DatasetMeta = {
  /** 사업대상지 이름 (예: 경기도 수원시 영통구) */
  area: string;
  /** 서버가 확인한 법정동코드 앞 5자리 */
  lawdCode: string | null;
  /** 조회일 (한국 시간 YYYY-MM-DD) */
  fetchedAt: string;
  source: string;
  /** API가 돌려준 전체 건수 */
  rawCount: number;
  /** 서버에서 뺀 건수와 이유 */
  excluded: { reason: string; count: number }[];
};

export const SOURCE = {
  legalDong: "행정안전부 법정동코드",
  presale: "국토교통부 아파트 분양권전매 실거래가",
  rent: "국토교통부 아파트 전월세 실거래가",
  applyhomeInfo: "한국부동산원 청약홈 분양정보",
  applyhomeCompetition: "한국부동산원 청약홈 청약접수 경쟁률",
} as const;

/** 중위값. 값이 없으면 null. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** "95,815" 같은 금액 문자열을 숫자로. 비었거나 숫자가 아니면 null. */
export function parseNumberText(text: string | number | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  const cleaned = text.replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 오늘 날짜(YYYY-MM-DD)를 기준으로 지난달부터 거꾸로 count개월을 오래된 순서의 YYYYMM 목록으로. */
export function recentMonths(today: string, count = 12): string[] {
  const [year, month] = today.split("-").map(Number);
  const months: string[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/** 오늘 날짜(YYYY-MM-DD)에서 years년 전 같은 날짜(YYYY-MM-DD). */
export function yearsAgo(today: string, years: number): string {
  const [year, month, day] = today.split("-").map(Number);
  const d = new Date(Date.UTC(year - years, month - 1, day));
  return d.toISOString().slice(0, 10);
}

/** 사업대상지 문자열을 시도와 시군구로 나눈다. 시도가 17개 전체 이름이 아니면 null. */
export function splitArea(area: string): { sido: string; sigungu: string } | null {
  const normalized = area.trim().replace(/\s+/g, " ");
  const space = normalized.indexOf(" ");
  if (space < 0) return null;
  const sido = normalized.slice(0, space);
  const sigungu = normalized.slice(space + 1);
  if (!(SIDO_NAMES as readonly string[]).includes(sido) || sigungu === "") return null;
  return { sido, sigungu };
}

/** 청약홈 공급위치가 쓰는 시도 표기(전체·약칭)를 모두 돌려준다. */
export function sidoAliases(sido: string): string[] {
  const short: Record<string, string[]> = {
    서울특별시: ["서울"],
    부산광역시: ["부산"],
    대구광역시: ["대구"],
    인천광역시: ["인천"],
    광주광역시: ["광주"],
    대전광역시: ["대전"],
    울산광역시: ["울산"],
    세종특별자치시: ["세종"],
    경기도: ["경기"],
    강원특별자치도: ["강원", "강원도"],
    충청북도: ["충북"],
    충청남도: ["충남"],
    전북특별자치도: ["전북", "전라북도"],
    전라남도: ["전남"],
    경상북도: ["경북"],
    경상남도: ["경남"],
    제주특별자치도: ["제주", "제주도"],
  };
  return [sido, ...(short[sido] ?? [])];
}

/** 주소가 해당 시도로 시작하는지 확인한다. (약칭 포함) */
export function addressInSido(address: string, sido: string): boolean {
  const trimmed = address.trim();
  return sidoAliases(sido).some((alias) => trimmed.startsWith(alias));
}

/** 단지명 비교용: 공백·괄호·특수문자·"아파트"를 지운다. */
export function normalizeComplexName(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .replace(/아파트/g, "")
    .replace(/[^0-9A-Za-z가-힣]/g, "")
    .toLowerCase();
}

/** 청약홈 주택형 "084.9543T" → 전용면적 84.9543. 해석할 수 없으면 null. */
export function exclusiveAreaFromHouseTy(houseTy: string): number | null {
  const match = houseTy.trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

// ─────────────────────────────────────────────────────────────
// XML (국토교통부 실거래가 · 행정안전부 법정동코드)
// ─────────────────────────────────────────────────────────────

/** XML 특수문자 되돌리기 */
function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 평평한 XML 레코드(<item>, <row>)들을 {태그: 값} 목록으로 바꾼다. */
export function parseXmlRecords(xml: string, recordTag: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const recordPattern = new RegExp(`<${recordTag}>([\\s\\S]*?)</${recordTag}>`, "g");
  for (const recordMatch of xml.matchAll(recordPattern)) {
    const record: Record<string, string> = {};
    for (const field of recordMatch[1].matchAll(/<(\w+)>([\s\S]*?)<\/\1>|<(\w+)\s*\/>/g)) {
      if (field[1]) record[field[1]] = decodeXml(field[2]).trim();
      else if (field[3]) record[field[3]] = "";
    }
    records.push(record);
  }
  return records;
}

/** XML에서 처음 나오는 태그 값. 없으면 null. */
export function xmlValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXml(match[1]).trim() : null;
}

/** 국토교통부 실거래가 오류 코드 → 기술문서의 설명 */
const RTMS_ERRORS: Record<string, string> = {
  "01": "제공기관 서비스 제공 상태가 원활하지 않습니다.",
  "02": "제공기관 서비스 제공 상태가 원활하지 않습니다. (DB)",
  "04": "제공기관 서비스 제공 상태가 원활하지 않습니다. (HTTP)",
  "05": "제공기관 서비스 응답 시간이 초과되었습니다.",
  "10": "요청에 인증키가 없습니다.",
  "11": "필수 요청 파라미터가 없습니다.",
  "12": "해당 오픈 API 서비스가 없거나 폐기되었습니다.",
  "20": "활용승인이 되지 않은 API입니다.",
  "22": "일일 활용건수를 초과했습니다.",
  "30": "등록되지 않은 인증키입니다.",
  "31": "기간이 만료된 인증키입니다.",
  "32": "등록되지 않은 도메인 또는 IP입니다.",
};

/** 공공데이터포털 공통 오류 응답(OpenAPI_ServiceResponse)이면 설명을, 아니면 null을 돌려준다. */
export function gatewayError(xml: string): string | null {
  const code = xmlValue(xml, "returnReasonCode");
  if (code === null) return null;
  return RTMS_ERRORS[code.padStart(2, "0")] ?? `공공데이터포털 오류 (코드 ${code})`;
}

/** 실거래가 응답 헤더를 읽는다. 정상(000)이 아니면 error에 설명. */
export function rtmsHeader(xml: string): { error: string | null; totalCount: number } {
  const gateway = gatewayError(xml);
  if (gateway) return { error: gateway, totalCount: 0 };
  const code = xmlValue(xml, "resultCode");
  const totalCount = parseNumberText(xmlValue(xml, "totalCount")) ?? 0;
  if (code === null) return { error: "응답 형식을 해석하지 못했습니다.", totalCount: 0 };
  if (code === "000" || code === "00") return { error: null, totalCount };
  if (code === "03") return { error: null, totalCount: 0 };
  return {
    error: RTMS_ERRORS[code] ?? xmlValue(xml, "resultMsg") ?? `오류 코드 ${code}`,
    totalCount: 0,
  };
}

// ─────────────────────────────────────────────────────────────
// 법정동코드
// ─────────────────────────────────────────────────────────────

export type RegionCandidate = {
  /** 법정동코드 앞 5자리 (실거래가 LAWD_CD) */
  code: string;
  name: string;
  /** 생성일 YYYYMMDD */
  adoptedAt: string;
};

/** 법정동코드 응답 헤더: 정상(INFO-0)·자료없음(INFO-200)이 아니면 error */
export function legalDongHeader(xml: string): { error: string | null; totalCount: number } {
  const gateway = gatewayError(xml);
  if (gateway) return { error: gateway, totalCount: 0 };
  const code = xmlValue(xml, "resultCode");
  const totalCount = parseNumberText(xmlValue(xml, "totalCount")) ?? 0;
  if (code === "INFO-0") return { error: null, totalCount };
  if (code === "INFO-200") return { error: null, totalCount: 0 };
  return { error: xmlValue(xml, "resultMsg") ?? "법정동코드 조회에 실패했습니다.", totalCount: 0 };
}

/** 법정동코드 행 중 시군구 단위(읍면동·리 코드가 0)만 후보로 고른다. */
export function regionCandidatesFromRows(rows: Record<string, string>[]): RegionCandidate[] {
  return rows
    .filter(
      (row) =>
        row.sgg_cd !== undefined &&
        row.sgg_cd !== "000" &&
        row.umd_cd === "000" &&
        (row.ri_cd === "00" || row.ri_cd === undefined) &&
        (row.region_cd ?? "").length >= 5,
    )
    .map((row) => ({
      code: row.region_cd.slice(0, 5),
      name: (row.locatadd_nm ?? "").replace(/\s+/g, " ").trim(),
      adoptedAt: row.adpt_de ?? "",
    }));
}

/**
 * 사업대상지 주소에 해당하는 시군구를 고른다.
 * 주소가 후보 이름과 같거나 "후보 이름 + 공백"으로 시작하면 해당한다. (예: "서울특별시 영등포구 당산동3가" → "서울특별시 영등포구")
 * 여럿이면 이름이 가장 긴 것(수원시보다 수원시 영통구), 그래도 같으면 생성일이 가장 늦은 것.
 */
export function pickRegion(candidates: RegionCandidate[], area: string): RegionCandidate | null {
  const target = area.replace(/\s+/g, " ").trim();
  const matches = candidates.filter((c) => target === c.name || target.startsWith(`${c.name} `));
  if (matches.length === 0) return null;
  return matches.reduce((best, c) => {
    if (c.name.length !== best.name.length) return c.name.length > best.name.length ? c : best;
    return c.adoptedAt > best.adoptedAt ? c : best;
  });
}

// ─────────────────────────────────────────────────────────────
// 실거래가 — 분양권전매 · 전월세
// ─────────────────────────────────────────────────────────────

export type PresaleDeal = {
  aptNm: string;
  umdNm: string;
  exclusiveM2: number;
  /** 거래금액, 만원 */
  dealAmount: number;
  ym: string;
  /** ownershipGbn — "입"이면 입주권 */
  isOccupancyRight: boolean;
};

/** 분양권전매 item 목록을 정리한다. 해제된 거래(cdealType 값 있음)와 필수값 누락은 뺀다. */
export function presaleDealsFromRows(rows: Record<string, string>[]): {
  deals: PresaleDeal[];
  canceled: number;
  invalid: number;
} {
  const deals: PresaleDeal[] = [];
  let canceled = 0;
  let invalid = 0;
  for (const row of rows) {
    if ((row.cdealType ?? "").trim() !== "") {
      canceled++;
      continue;
    }
    const exclusiveM2 = parseNumberText(row.excluUseAr);
    const dealAmount = parseNumberText(row.dealAmount);
    const year = parseNumberText(row.dealYear);
    const month = parseNumberText(row.dealMonth);
    if (exclusiveM2 === null || dealAmount === null || year === null || month === null) {
      invalid++;
      continue;
    }
    deals.push({
      aptNm: row.aptNm ?? "",
      umdNm: row.umdNm ?? "",
      exclusiveM2,
      dealAmount,
      ym: `${year}${String(month).padStart(2, "0")}`,
      isOccupancyRight: (row.ownershipGbn ?? "").trim() === "입",
    });
  }
  return { deals, canceled, invalid };
}

export type RentDeal = {
  aptNm: string;
  umdNm: string;
  exclusiveM2: number;
  /** 보증금, 만원 */
  deposit: number;
  /** 월세, 만원 (0이면 전세) */
  monthlyRent: number;
  buildYear: number | null;
  ym: string;
};

/** 전월세 item 목록을 정리한다. (기술문서에 해제여부 항목이 없어 해제 제외는 적용하지 않는다) */
export function rentDealsFromRows(rows: Record<string, string>[]): {
  deals: RentDeal[];
  invalid: number;
} {
  const deals: RentDeal[] = [];
  let invalid = 0;
  for (const row of rows) {
    const exclusiveM2 = parseNumberText(row.excluUseAr);
    const deposit = parseNumberText(row.deposit);
    const monthlyRent = parseNumberText(row.monthlyRent) ?? 0;
    const year = parseNumberText(row.dealYear);
    const month = parseNumberText(row.dealMonth);
    if (exclusiveM2 === null || deposit === null || year === null || month === null) {
      invalid++;
      continue;
    }
    deals.push({
      aptNm: row.aptNm ?? "",
      umdNm: row.umdNm ?? "",
      exclusiveM2,
      deposit,
      monthlyRent,
      buildYear: parseNumberText(row.buildYear),
      ym: `${year}${String(month).padStart(2, "0")}`,
    });
  }
  return { deals, invalid };
}

// ─────────────────────────────────────────────────────────────
// 청약홈 — 분양정보 · 주택형 · 경쟁률 (JSON, 대문자 필드)
// ─────────────────────────────────────────────────────────────

/** 청약홈 공고 한 건 (APT 분양 또는 잔여세대) */
export type Notice = {
  houseManageNo: string;
  pblancNo: string;
  houseNm: string;
  address: string;
  /** 모집공고일 YYYY-MM-DD */
  recruitDate: string;
  totalSupply: number | null;
};

/** 청약홈 data 배열을 공고 목록으로 바꾸고, 공급위치가 해당 시도가 아닌 공고는 뺀다. */
export function noticesFromData(
  data: Record<string, unknown>[],
  sido: string,
): { notices: Notice[]; otherSido: number } {
  const notices: Notice[] = [];
  let otherSido = 0;
  for (const row of data) {
    const address = String(row.HSSPLY_ADRES ?? "");
    if (!addressInSido(address, sido)) {
      otherSido++;
      continue;
    }
    notices.push({
      houseManageNo: String(row.HOUSE_MANAGE_NO ?? ""),
      pblancNo: String(row.PBLANC_NO ?? ""),
      houseNm: String(row.HOUSE_NM ?? ""),
      address,
      recruitDate: String(row.RCRIT_PBLANC_DE ?? ""),
      totalSupply: parseNumberText(row.TOT_SUPLY_HSHLDCO as string | number | null),
    });
  }
  return { notices, otherSido };
}

export type HouseTypePrice = {
  houseTy: string;
  exclusiveM2: number | null;
  /** 공급면적 ㎡ */
  supplyM2: number | null;
  /** 공급금액(분양최고금액), 만원 */
  topAmount: number | null;
  generalSupply: number | null;
  specialSupply: number | null;
};

/** APT 분양정보 주택형별 상세조회 data → 주택형별 분양가 */
export function houseTypesFromData(data: Record<string, unknown>[]): HouseTypePrice[] {
  return data.map((row) => {
    const houseTy = String(row.HOUSE_TY ?? "").trim();
    return {
      houseTy,
      exclusiveM2: exclusiveAreaFromHouseTy(houseTy),
      supplyM2: parseNumberText(row.SUPLY_AR as string | null),
      topAmount: parseNumberText(row.LTTOT_TOP_AMOUNT as string | null),
      generalSupply: parseNumberText(row.SUPLY_HSHLDCO as number | null),
      specialSupply: parseNumberText(row.SPSPLY_HSHLDCO as number | null),
    };
  });
}

export type CompetitionRow = {
  houseTy: string;
  /** 순위 (1, 2) */
  rank: number;
  resideName: string;
  /** 공급세대수 */
  supply: number;
  /** 접수건수 */
  requests: number;
};

/** APT 분양정보/경쟁률 조회 data → 경쟁률 행. 순위·세대수가 없는 행은 뺀다. */
export function competitionFromData(data: Record<string, unknown>[]): CompetitionRow[] {
  const rows: CompetitionRow[] = [];
  for (const row of data) {
    const rank = parseNumberText(row.SUBSCRPT_RANK_CODE as string | number | null);
    const supply = parseNumberText(row.SUPLY_HSHLDCO as string | number | null);
    if (rank === null || supply === null) continue;
    rows.push({
      houseTy: String(row.HOUSE_TY ?? "").trim(),
      rank,
      resideName: String(row.RESIDE_SENM ?? ""),
      supply,
      requests: parseNumberText(row.REQ_CNT as string | number | null) ?? 0,
    });
  }
  return rows;
}

/** 단지 한 곳의 주택형별 분양가와 경쟁률 */
export type NoticeDetail = {
  houseManageNo: string;
  pblancNo: string;
  types: HouseTypePrice[];
  competition: CompetitionRow[];
  fetchedAt: string;
};

/** 공고를 가리키는 키 */
export function noticeKey(n: { houseManageNo: string; pblancNo: string }): string {
  return `${n.houseManageNo}-${n.pblancNo}`;
}

// ─────────────────────────────────────────────────────────────
// 표 1 — 인근 신규 84㎡ 공급평당 vs 계획가
// ─────────────────────────────────────────────────────────────

export type NewSupplyRow = {
  houseNm: string;
  recruitDate: string;
  houseTy: string;
  exclusiveM2: number;
  supplyM2: number;
  /** 공급금액(최고), 만원 */
  topAmount: number;
  /** 공급평당가(만원) = 공급금액 ÷ (공급면적 × 0.3025) */
  pricePerPyeong: number;
};

export type NewSupplyTable = {
  rows: NewSupplyRow[];
  median: number | null;
  min: number | null;
  max: number | null;
  planPrice: number | null;
  /** (계획가 − 중위값) ÷ 중위값 × 100 */
  planVsMedianPct: number | null;
  excluded: { reason: string; count: number }[];
};

/** 인근 신규 공급 단지의 84㎡형 공급평당가를 모아 계획 평당가와 비교한다. */
export function buildNewSupplyTable(
  notices: Notice[],
  details: Record<string, NoticeDetail>,
  planPrice: number | null,
): NewSupplyTable {
  const rows: NewSupplyRow[] = [];
  let notBand = 0;
  let missing = 0;
  for (const notice of notices) {
    const detail = details[noticeKey(notice)];
    if (!detail) continue;
    for (const t of detail.types) {
      if (t.exclusiveM2 === null || !isBand84(t.exclusiveM2)) {
        notBand++;
        continue;
      }
      if (t.supplyM2 === null || t.supplyM2 <= 0 || t.topAmount === null || t.topAmount <= 0) {
        missing++;
        continue;
      }
      rows.push({
        houseNm: notice.houseNm,
        recruitDate: notice.recruitDate,
        houseTy: t.houseTy,
        exclusiveM2: t.exclusiveM2,
        supplyM2: t.supplyM2,
        topAmount: t.topAmount,
        pricePerPyeong: t.topAmount / (t.supplyM2 * PYEONG_PER_M2),
      });
    }
  }
  rows.sort((a, b) => a.pricePerPyeong - b.pricePerPyeong);
  const prices = rows.map((r) => r.pricePerPyeong);
  const mid = median(prices);
  return {
    rows,
    median: mid,
    min: prices.length ? prices[0] : null,
    max: prices.length ? prices[prices.length - 1] : null,
    planPrice,
    planVsMedianPct:
      mid !== null && planPrice !== null && mid > 0 ? ((planPrice - mid) / mid) * 100 : null,
    excluded: [
      { reason: `전용 ${BAND_84.min}~${BAND_84.max}㎡ 밖 주택형`, count: notBand },
      { reason: "공급면적·공급금액 없음", count: missing },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// 표 2 — 분양권 웃돈 (입주권 제외)
// ─────────────────────────────────────────────────────────────

/** 단지명·전용면적이 청약홈 주택형과 같은 것으로 보는 오차(㎡) */
export const AREA_MATCH_TOLERANCE = 0.05;

export type PremiumRow = {
  aptNm: string;
  umdNm: string;
  ym: string;
  exclusiveM2: number;
  dealAmount: number;
  /** 매칭된 청약홈 주택형의 공급금액(최고), 만원 */
  supplyPrice: number;
  /** 웃돈 = 거래금액 − 공급금액, 만원 */
  premium: number;
  matchedHouseNm: string;
};

export type PremiumTable = {
  rows: PremiumRow[];
  median: number | null;
  /** 웃돈이 0 이하인 거래 수 */
  nonPositive: number;
  excluded: { reason: string; count: number }[];
};

/** 분양권 거래를 청약홈 단지·주택형과 맞춰 웃돈을 구한다. */
export function buildPremiumTable(
  deals: PresaleDeal[],
  notices: Notice[],
  details: Record<string, NoticeDetail>,
): PremiumTable {
  const priced = notices.flatMap((notice) => {
    const detail = details[noticeKey(notice)];
    if (!detail) return [];
    return detail.types
      .filter((t) => t.exclusiveM2 !== null && t.topAmount !== null)
      .map((t) => ({
        name: normalizeComplexName(notice.houseNm),
        houseNm: notice.houseNm,
        exclusiveM2: t.exclusiveM2!,
        topAmount: t.topAmount!,
      }));
  });

  const rows: PremiumRow[] = [];
  let occupancy = 0;
  let unmatched = 0;
  for (const deal of deals) {
    if (deal.isOccupancyRight) {
      occupancy++;
      continue;
    }
    const dealName = normalizeComplexName(deal.aptNm);
    const match = priced.find(
      (p) =>
        dealName !== "" &&
        p.name !== "" &&
        (p.name.includes(dealName) || dealName.includes(p.name)) &&
        Math.abs(p.exclusiveM2 - deal.exclusiveM2) <= AREA_MATCH_TOLERANCE,
    );
    if (!match) {
      unmatched++;
      continue;
    }
    rows.push({
      aptNm: deal.aptNm,
      umdNm: deal.umdNm,
      ym: deal.ym,
      exclusiveM2: deal.exclusiveM2,
      dealAmount: deal.dealAmount,
      supplyPrice: match.topAmount,
      premium: deal.dealAmount - match.topAmount,
      matchedHouseNm: match.houseNm,
    });
  }
  rows.sort((a, b) => a.premium - b.premium);
  return {
    rows,
    median: median(rows.map((r) => r.premium)),
    nonPositive: rows.filter((r) => r.premium <= 0).length,
    excluded: [
      { reason: "입주권", count: occupancy },
      { reason: `청약홈 단지명·전용면적(±${AREA_MATCH_TOLERANCE}㎡) 매칭 안 됨`, count: unmatched },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// 표 3 — 1·2순위 미달 · 잔여세대
// ─────────────────────────────────────────────────────────────

export type ShortfallRow = {
  houseNm: string;
  recruitDate: string;
  houseTy: string;
  supply: number;
  rank1Requests: number;
  rank2Requests: number;
  /** 1순위 접수 < 공급세대수 */
  shortAfterRank1: boolean;
  /** 1순위 + 2순위 접수 < 공급세대수 */
  shortAfterRank2: boolean;
};

export type ShortfallTable = {
  rows: ShortfallRow[];
  shortAfterRank1: number;
  shortAfterRank2: number;
  remainders: Notice[];
  /** 잔여세대 공고 공급규모 합계 */
  remainderHouseholds: number;
  excluded: { reason: string; count: number }[];
};

/** 주택형별 1·2순위 접수를 공급세대수와 비교하고, 잔여세대 공고를 붙인다. */
export function buildShortfallTable(
  notices: Notice[],
  details: Record<string, NoticeDetail>,
  remainders: Notice[],
): ShortfallTable {
  const rows: ShortfallRow[] = [];
  let noCompetition = 0;
  for (const notice of notices) {
    const detail = details[noticeKey(notice)];
    if (!detail) continue;
    if (detail.competition.length === 0) {
      noCompetition++;
      continue;
    }
    const byType = new Map<string, CompetitionRow[]>();
    for (const row of detail.competition) {
      byType.set(row.houseTy, [...(byType.get(row.houseTy) ?? []), row]);
    }
    for (const [houseTy, typeRows] of byType) {
      const supply = Math.max(...typeRows.map((r) => r.supply));
      const rank1 = typeRows.filter((r) => r.rank === 1).reduce((a, r) => a + r.requests, 0);
      const rank2 = typeRows.filter((r) => r.rank === 2).reduce((a, r) => a + r.requests, 0);
      rows.push({
        houseNm: notice.houseNm,
        recruitDate: notice.recruitDate,
        houseTy,
        supply,
        rank1Requests: rank1,
        rank2Requests: rank2,
        shortAfterRank1: rank1 < supply,
        shortAfterRank2: rank1 + rank2 < supply,
      });
    }
  }
  return {
    rows,
    shortAfterRank1: rows.filter((r) => r.shortAfterRank1).length,
    shortAfterRank2: rows.filter((r) => r.shortAfterRank2).length,
    remainders,
    remainderHouseholds: remainders.reduce((a, n) => a + (n.totalSupply ?? 0), 0),
    excluded: [{ reason: "경쟁률 자료 없는 단지", count: noCompetition }],
  };
}

// ─────────────────────────────────────────────────────────────
// 표 4 — 84㎡ 신규 전세 ÷ 우리 84㎡ 세대당 분양가
// ─────────────────────────────────────────────────────────────

/** 신규(신축)로 보는 건축년도 범위: 조회연도 − 이 값 이상 */
export const NEW_BUILD_YEARS = 5;

export type JeonseTable = {
  rows: RentDeal[];
  medianDeposit: number | null;
  /** 우리 84㎡ 세대당 분양가, 만원 */
  our84Price: number | null;
  /** 중위 전세보증금 ÷ 우리 84㎡ 세대당 분양가 × 100 */
  ratioPct: number | null;
  excluded: { reason: string; count: number }[];
};

/** 84㎡형 신축 전세 보증금 중위값을 우리 84㎡ 세대당 분양가와 나눈다. */
export function buildJeonseTable(
  deals: RentDeal[],
  our84Price: number | null,
  today: string,
): JeonseTable {
  const minBuildYear = Number(today.slice(0, 4)) - NEW_BUILD_YEARS;
  let monthly = 0;
  let notBand = 0;
  let old = 0;
  const rows: RentDeal[] = [];
  for (const deal of deals) {
    if (deal.monthlyRent > 0) {
      monthly++;
      continue;
    }
    if (!isBand84(deal.exclusiveM2)) {
      notBand++;
      continue;
    }
    if (deal.buildYear === null || deal.buildYear < minBuildYear) {
      old++;
      continue;
    }
    rows.push(deal);
  }
  rows.sort((a, b) => a.deposit - b.deposit);
  const medianDeposit = median(rows.map((r) => r.deposit));
  return {
    rows,
    medianDeposit,
    our84Price,
    ratioPct:
      medianDeposit !== null && our84Price !== null && our84Price > 0
        ? (medianDeposit / our84Price) * 100
        : null,
    excluded: [
      { reason: "월세(월세금액 > 0)", count: monthly },
      { reason: `전용 ${BAND_84.min}~${BAND_84.max}㎡ 밖`, count: notBand },
      { reason: `건축년도 ${minBuildYear - 1}년 이하 또는 없음`, count: old },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// 결론 옆 — 시장 대비 여유
// ─────────────────────────────────────────────────────────────

export type MarketMargin = {
  /** 상환 한계 평당가, 만원 */
  repaymentLimitPrice: number;
  /** 인근 신규 84㎡ 공급평당가 중위값, 만원 */
  marketPrice: number;
  /** (시장 − 상환 한계) ÷ 시장 × 100. 양수면 시장가가 한계보다 높아 여유가 있다 */
  marginPct: number;
};

/** 상환 한계 평당가와 인근 신규 공급평당 중위값을 비교한다. 하나라도 없으면 null. */
export function buildMarketMargin(
  repaymentLimitPrice: number | null,
  marketPrice: number | null,
): MarketMargin | null {
  if (repaymentLimitPrice === null || marketPrice === null || marketPrice <= 0) return null;
  return {
    repaymentLimitPrice,
    marketPrice,
    marginPct: ((marketPrice - repaymentLimitPrice) / marketPrice) * 100,
  };
}

// ─────────────────────────────────────────────────────────────
// 동시 호출 제한
// ─────────────────────────────────────────────────────────────

/** 동시에 최대 concurrency개까지만 실행하는 작업 줄을 만든다. */
export function createTaskQueue(concurrency: number) {
  const waiting: (() => void)[] = [];
  let active = 0;

  /** 자리가 나면 대기 중인 작업을 시작한다. */
  function pump() {
    while (active < concurrency && waiting.length > 0) {
      active++;
      waiting.shift()!();
    }
  }

  return {
    /** 작업을 줄에 넣고, 끝나면 결과를 돌려받는다. */
    push<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        waiting.push(() => {
          task()
            .then(resolve, reject)
            .finally(() => {
              active--;
              pump();
            });
        });
        pump();
      });
    },
    /** 지금 실행 중인 작업 수 */
    get active() {
      return active;
    },
  };
}
