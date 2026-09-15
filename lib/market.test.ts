import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildJeonseTable,
  buildMarketMargin,
  buildNewSupplyTable,
  buildPremiumTable,
  buildShortfallTable,
  competitionFromData,
  createTaskQueue,
  exclusiveAreaFromHouseTy,
  gatewayError,
  houseTypesFromData,
  legalDongHeader,
  noticeKey,
  noticesFromData,
  parseXmlRecords,
  pickRegion,
  presaleDealsFromRows,
  recentMonths,
  regionCandidatesFromRows,
  rentDealsFromRows,
  rtmsHeader,
  splitArea,
  yearsAgo,
  type Notice,
  type NoticeDetail,
  type PresaleDeal,
  type RentDeal,
} from "./market.ts";

/** 부동소수 오차 허용 비교 */
function assertClose(actual: number | null, expected: number, tolerance = 1e-9) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

// 기술문서 "요청/응답 메시지 예제" 그대로
const PRESALE_XML = `<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items><item><aptNm>청계 SK VIEW</aptNm><buyerGbn>개인</buyerGbn><cdealDay> </cdealDay><cdealType> </cdealType><dealAmount>95,815</dealAmount><dealDay>29</dealDay><dealMonth>1</dealMonth><dealYear>2024</dealYear><dealingGbn>직거래</dealingGbn><estateAgentSggNm> </estateAgentSggNm><excluUseAr>59.8738</excluUseAr><floor>34</floor><jibun>121</jibun><ownershipGbn>입</ownershipGbn><sggCd>11200</sggCd><sggNm>성동구</sggNm><slerGbn>개인</slerGbn><umdNm>용답동</umdNm></item></items><numOfRows>1</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount></body></response>`;

const RENT_XML = `<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items><item><aptNm>두산</aptNm><aptSeq>11110-34</aptSeq><buildYear>1999</buildYear><contractTerm> </contractTerm><contractType> </contractType><dealDay>20</dealDay><dealMonth>7</dealMonth><dealYear>2024</dealYear><deposit>50,000</deposit><excluUseAr>59.95</excluUseAr><floor>3</floor><jibun>232</jibun><monthlyRent>0</monthlyRent><preDeposit> </preDeposit><preMonthlyRent> </preMonthlyRent><roadnm>지봉로5길 7</roadnm><sggCd>11110</sggCd><umdNm>창신동</umdNm><useRRRight> </useRRRight></item></items><numOfRows>1</numOfRows><pageNo>1</pageNo><totalCount>159</totalCount></body></response>`;

const LEGAL_DONG_XML = `<StanReginCd> <head> <totalCount>1</totalCount> <numOfRows>3</numOfRows> <pageNo>1</pageNo> <type>XML</type> <RESULT> <resultCode>INFO-0</resultCode> <resultMsg>NOMAL SERVICE</resultMsg> </RESULT> </head> <row> <region_cd>1100000000</region_cd> <sido_cd>11</sido_cd> <sgg_cd>000</sgg_cd> <umd_cd>000</umd_cd> <ri_cd>00</ri_cd> <locatjumin_cd>1100000000</locatjumin_cd> <locatjijuk_cd>1100000000</locatjijuk_cd> <locatadd_nm>서울특별시</locatadd_nm> <locat_order>11</locat_order> <locat_rm/> <locathigh_cd>0000000000</locathigh_cd> <locallow_nm>서울특별시</locallow_nm> <adpt_de>20000101</adpt_de> </row> </StanReginCd>`;

describe("응답 해석 — 기술문서 예제", () => {
  test("분양권전매: 금액 콤마 제거, 공백 cdealType은 해제 아님, ownershipGbn '입'은 입주권", () => {
    const header = rtmsHeader(PRESALE_XML);
    assert.deepEqual(header, { error: null, totalCount: 1 });
    const { deals, canceled, invalid } = presaleDealsFromRows(parseXmlRecords(PRESALE_XML, "item"));
    assert.equal(canceled, 0);
    assert.equal(invalid, 0);
    assert.deepEqual(deals, [
      {
        aptNm: "청계 SK VIEW",
        umdNm: "용답동",
        exclusiveM2: 59.8738,
        dealAmount: 95815,
        ym: "202401",
        isOccupancyRight: true,
      },
    ]);
  });

  test("분양권전매: cdealType에 값이 있으면 해제 거래로 뺀다", () => {
    const rows = parseXmlRecords(PRESALE_XML.replace("<cdealType> </cdealType>", "<cdealType>O</cdealType>"), "item");
    assert.equal(presaleDealsFromRows(rows).canceled, 1);
  });

  test("전월세: 보증금 50,000만원 · 월세 0 · 건축년도 1999", () => {
    assert.equal(rtmsHeader(RENT_XML).totalCount, 159);
    const { deals } = rentDealsFromRows(parseXmlRecords(RENT_XML, "item"));
    assert.equal(deals[0].deposit, 50000);
    assert.equal(deals[0].monthlyRent, 0);
    assert.equal(deals[0].buildYear, 1999);
    assert.equal(deals[0].ym, "202407");
  });

  test("공공데이터포털 공통 오류(returnReasonCode 30) → 등록되지 않은 인증키", () => {
    const xml = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    assert.equal(gatewayError(xml), "등록되지 않은 인증키입니다.");
    assert.equal(rtmsHeader(xml).error, "등록되지 않은 인증키입니다.");
  });

  test("법정동코드: 시도 행(sgg_cd 000)은 시군구 후보가 아니다", () => {
    assert.deepEqual(legalDongHeader(LEGAL_DONG_XML), { error: null, totalCount: 1 });
    const rows = parseXmlRecords(LEGAL_DONG_XML, "row");
    assert.equal(rows[0].locat_rm, "");
    assert.deepEqual(regionCandidatesFromRows(rows), []);
  });

  test("법정동코드: 시군구 행에서 앞 5자리, 같은 이름이 여럿이면 생성일이 늦은 코드", () => {
    const rows = [
      { region_cd: "4111700000", sgg_cd: "117", umd_cd: "000", ri_cd: "00", locatadd_nm: "경기도 수원시 영통구", adpt_de: "20030101" },
      { region_cd: "4111799999", sgg_cd: "117", umd_cd: "000", ri_cd: "00", locatadd_nm: "경기도  수원시 영통구", adpt_de: "19990101" },
      { region_cd: "4111710100", sgg_cd: "117", umd_cd: "101", ri_cd: "00", locatadd_nm: "경기도 수원시 영통구 매탄동", adpt_de: "20030101" },
    ];
    const candidates = regionCandidatesFromRows(rows);
    assert.equal(candidates.length, 2);
    assert.deepEqual(pickRegion(candidates, "경기도 수원시 영통구"), {
      code: "41117",
      name: "경기도 수원시 영통구",
      adoptedAt: "20030101",
    });
    assert.equal(pickRegion(candidates, "경기도 수원시"), null);
  });

  test("청약홈 주택형별: HOUSE_TY '058.8500A' → 전용 58.85, LTTOT_TOP_AMOUNT '46,357' → 46,357", () => {
    const types = houseTypesFromData([
      { HOUSE_TY: "058.8500A", SUPLY_AR: "80.3800", LTTOT_TOP_AMOUNT: "80720", SUPLY_HSHLDCO: 8, SPSPLY_HSHLDCO: 11 },
      { HOUSE_TY: "084.9840 ", SUPLY_AR: null, LTTOT_TOP_AMOUNT: "46,357", SUPLY_HSHLDCO: 16, SPSPLY_HSHLDCO: null },
    ]);
    assert.equal(types[0].exclusiveM2, 58.85);
    assert.equal(types[0].supplyM2, 80.38);
    assert.equal(types[1].houseTy, "084.9840");
    assert.equal(types[1].supplyM2, null);
    assert.equal(types[1].topAmount, 46357);
    assert.equal(exclusiveAreaFromHouseTy("abc"), null);
  });

  test("청약홈 경쟁률: CMPET_RATE '-'이어도 REQ_CNT로 읽는다", () => {
    const rows = competitionFromData([
      { CMPET_RATE: "401.00", HOUSE_TY: "084.9543T", REQ_CNT: "401", RESIDE_SENM: "해당지역", SUBSCRPT_RANK_CODE: 1, SUPLY_HSHLDCO: 1 },
      { CMPET_RATE: "-", HOUSE_TY: "084.9543T", REQ_CNT: "0", RESIDE_SENM: "해당지역", SUBSCRPT_RANK_CODE: 2, SUPLY_HSHLDCO: 1 },
    ]);
    assert.deepEqual(rows.map((r) => [r.rank, r.requests]), [[1, 401], [2, 0]]);
  });

  test("청약홈 공고: 공급위치가 다른 시도면 뺀다 (약칭 '경기' 허용)", () => {
    const { notices, otherSido } = noticesFromData(
      [
        { HOUSE_MANAGE_NO: 1, PBLANC_NO: 1, HOUSE_NM: "가", HSSPLY_ADRES: "경기도 수원시 영통구 매탄동 1", RCRIT_PBLANC_DE: "2025-01-01", TOT_SUPLY_HSHLDCO: 100 },
        { HOUSE_MANAGE_NO: 2, PBLANC_NO: 2, HOUSE_NM: "나", HSSPLY_ADRES: "경기 수원시 영통구 원천동 2", RCRIT_PBLANC_DE: "2025-02-01", TOT_SUPLY_HSHLDCO: 50 },
        { HOUSE_MANAGE_NO: 3, PBLANC_NO: 3, HOUSE_NM: "다", HSSPLY_ADRES: "서울특별시 중구 1", RCRIT_PBLANC_DE: "2025-03-01", TOT_SUPLY_HSHLDCO: 10 },
      ],
      "경기도",
    );
    assert.equal(notices.length, 2);
    assert.equal(otherSido, 1);
    assert.equal(notices[0].houseManageNo, "1");
  });
});

describe("날짜·지역", () => {
  test("2026-09-15 기준 최근 12개월 = 2025-09 ~ 2026-08", () => {
    const months = recentMonths("2026-09-15");
    assert.equal(months.length, 12);
    assert.equal(months[0], "202509");
    assert.equal(months[11], "202608");
    assert.deepEqual(recentMonths("2026-01-10", 2), ["202511", "202512"]);
  });

  test("3년 전 = 2023-09-15", () => {
    assert.equal(yearsAgo("2026-09-15", 3), "2023-09-15");
  });

  test("사업대상지는 시도 전체 이름 + 시군구", () => {
    assert.deepEqual(splitArea(" 경기도  수원시 영통구 "), { sido: "경기도", sigungu: "수원시 영통구" });
    assert.equal(splitArea("경기 수원시"), null);
    assert.equal(splitArea("경기도"), null);
  });
});

// ── 표 계산용 가상 자료 (실제 단지 아님) ──
const NOTICE: Notice = {
  houseManageNo: "100",
  pblancNo: "100",
  houseNm: "가상단지 아파트",
  address: "경기도 가상시 1",
  recruitDate: "2025-05-01",
  totalSupply: 30,
};

const DETAIL: NoticeDetail = {
  houseManageNo: "100",
  pblancNo: "100",
  fetchedAt: "2026-09-15",
  types: [
    // 공급 100㎡ = 30.25평
    { houseTy: "084.9000A", exclusiveM2: 84.9, supplyM2: 100, topAmount: 60500, generalSupply: 10, specialSupply: 0 },
    { houseTy: "084.8000B", exclusiveM2: 84.8, supplyM2: 100, topAmount: 72600, generalSupply: 10, specialSupply: 0 },
    { houseTy: "084.7000C", exclusiveM2: 84.7, supplyM2: 100, topAmount: 90750, generalSupply: 5, specialSupply: 0 },
    { houseTy: "059.9000A", exclusiveM2: 59.9, supplyM2: 80, topAmount: 50000, generalSupply: 5, specialSupply: 0 },
    { houseTy: "084.6000D", exclusiveM2: 84.6, supplyM2: null, topAmount: 70000, generalSupply: 5, specialSupply: 0 },
  ],
  competition: [
    { houseTy: "084.9000A", rank: 1, resideName: "해당지역", supply: 10, requests: 4 },
    { houseTy: "084.9000A", rank: 1, resideName: "기타지역", supply: 10, requests: 2 },
    { houseTy: "084.9000A", rank: 2, resideName: "해당지역", supply: 10, requests: 8 },
    { houseTy: "084.8000B", rank: 1, resideName: "해당지역", supply: 10, requests: 30 },
    { houseTy: "084.7000C", rank: 1, resideName: "해당지역", supply: 5, requests: 1 },
    { houseTy: "084.7000C", rank: 2, resideName: "해당지역", supply: 5, requests: 1 },
  ],
};

const DETAILS = { [noticeKey(NOTICE)]: DETAIL };

describe("표 1 — 인근 신규 84㎡ 공급평당 vs 계획가", () => {
  test("60,500 ÷ 30.25 = 2,000 · 72,600 ÷ 30.25 = 2,400 · 90,750 ÷ 30.25 = 3,000 → 중위 2,400, 계획 2,420은 +0.83%", () => {
    const table = buildNewSupplyTable([NOTICE], DETAILS, 2420);
    assert.equal(table.rows.length, 3);
    assertClose(table.rows[0].pricePerPyeong, 2000, 1e-9);
    assertClose(table.median, 2400, 1e-9);
    assertClose(table.min, 2000, 1e-9);
    assertClose(table.max, 3000, 1e-9);
    assertClose(table.planVsMedianPct, (20 / 2400) * 100, 1e-9);
    assert.deepEqual(table.excluded.map((e) => e.count), [1, 1]);
  });

  test("상세 자료가 없으면 행도 없고 중위값 null", () => {
    const table = buildNewSupplyTable([NOTICE], {}, 2420);
    assert.equal(table.median, null);
    assert.equal(table.planVsMedianPct, null);
  });
});

describe("표 2 — 분양권 웃돈", () => {
  const deal = (patch: Partial<PresaleDeal>): PresaleDeal => ({
    aptNm: "가상단지",
    umdNm: "가상동",
    exclusiveM2: 84.9,
    dealAmount: 70000,
    ym: "202601",
    isOccupancyRight: false,
    ...patch,
  });

  test("웃돈 = 거래 70,000 − 공급 60,500 = 9,500 · 거래 58,000 − 60,500 = −2,500 · 입주권·매칭 실패 제외", () => {
    const table = buildPremiumTable(
      [
        deal({}),
        deal({ dealAmount: 58000 }),
        deal({ isOccupancyRight: true }),
        deal({ aptNm: "다른단지" }),
        deal({ exclusiveM2: 84.0 }),
      ],
      [NOTICE],
      DETAILS,
    );
    assert.deepEqual(table.rows.map((r) => r.premium), [-2500, 9500]);
    assert.equal(table.nonPositive, 1);
    assertClose(table.median, 3500, 1e-9);
    assert.deepEqual(table.excluded.map((e) => e.count), [1, 2]);
  });
});

describe("표 3 — 1·2순위 미달 · 잔여세대", () => {
  test("A형 공급 10: 1순위 4+2=6 미달, +2순위 8=14 충족 · B형 30 충족 · C형 공급 5: 1+1=2 최종 미달", () => {
    const remainder: Notice = { ...NOTICE, houseManageNo: "200", pblancNo: "200", totalSupply: 16 };
    const table = buildShortfallTable([NOTICE], DETAILS, [remainder, { ...remainder, totalSupply: 4 }]);
    const byType = Object.fromEntries(table.rows.map((r) => [r.houseTy, r]));
    assert.equal(byType["084.9000A"].rank1Requests, 6);
    assert.equal(byType["084.9000A"].shortAfterRank1, true);
    assert.equal(byType["084.9000A"].shortAfterRank2, false);
    assert.equal(byType["084.8000B"].shortAfterRank1, false);
    assert.equal(byType["084.7000C"].shortAfterRank2, true);
    assert.equal(table.shortAfterRank1, 2);
    assert.equal(table.shortAfterRank2, 1);
    assert.equal(table.remainderHouseholds, 20);
  });
});

describe("표 4 — 84㎡ 신규 전세 ÷ 우리 84㎡ 세대당 분양가", () => {
  const rent = (patch: Partial<RentDeal>): RentDeal => ({
    aptNm: "가상",
    umdNm: "가상동",
    exclusiveM2: 84.9,
    deposit: 60000,
    monthlyRent: 0,
    buildYear: 2023,
    ym: "202601",
    ...patch,
  });

  test("신축 84㎡ 전세 50,000·60,000·70,000 → 중위 60,000 ÷ 83,732 = 71.66% · 월세·59㎡·2021년 이전 제외", () => {
    const table = buildJeonseTable(
      [
        rent({ deposit: 50000 }),
        rent({ deposit: 60000 }),
        rent({ deposit: 70000 }),
        rent({ monthlyRent: 100 }),
        rent({ exclusiveM2: 59.9 }),
        rent({ buildYear: 2020 }),
        rent({ buildYear: null }),
      ],
      83732,
      "2026-09-15",
    );
    assert.equal(table.rows.length, 3);
    assert.equal(table.medianDeposit, 60000);
    assertClose(table.ratioPct, (60000 / 83732) * 100, 1e-9);
    assert.deepEqual(table.excluded.map((e) => e.count), [1, 1, 2]);
  });
});

describe("시장 대비 여유", () => {
  test("상환 한계 1,934.2 vs 시장 2,400 → (2,400 − 1,934.2) ÷ 2,400 = 19.41%", () => {
    const margin = buildMarketMargin(1934.2, 2400)!;
    assertClose(margin.marginPct, (465.8 / 2400) * 100, 1e-9);
    assert.equal(buildMarketMargin(null, 2400), null);
    assert.equal(buildMarketMargin(1934.2, null), null);
  });
});

describe("동시 호출 제한", () => {
  test("작업 10개를 넣어도 동시에 4개까지만 실행하고 모두 끝난다", async () => {
    const queue = createTaskQueue(4);
    let running = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        queue.push(async () => {
          running++;
          peak = Math.max(peak, running);
          await new Promise((resolve) => setTimeout(resolve, 5));
          running--;
          return i;
        }),
      ),
    );
    assert.equal(peak, 4);
    assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(queue.active, 0);
  });

  test("실패한 작업이 있어도 다음 작업은 계속 실행된다", async () => {
    const queue = createTaskQueue(1);
    const failed = queue.push(async () => {
      throw new Error("x");
    });
    const next = queue.push(async () => "ok");
    await assert.rejects(failed);
    assert.equal(await next, "ok");
  });
});
