import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  bisect,
  calculatePlan,
  emptyPlanInput,
  emptyUnitType,
  our84UnitPrice,
  totalHouseholds,
  totalSupplyPyeong,
  type UnitType,
} from "./calc.ts";
import { PRESETS } from "./presets.ts";

/** 부동소수 오차 허용 비교 */
function assertClose(actual: number | null, expected: number, tolerance = 1e-9) {
  assert.notEqual(actual, null);
  assert.ok(
    Math.abs(actual! - expected) <= tolerance,
    `expected ${expected}, got ${actual}`,
  );
}

/** 프리셋 키로 주택형 표를 꺼낸다 */
function rowsOf(key: "A" | "B" | "C"): UnitType[] {
  const preset = PRESETS.find((p) => p.key === key);
  assert.ok(preset, `preset ${key} not found`);
  return preset.input.unitTypes;
}

describe("공급면적 합계 · 세대수 — 임시 값 표와 일치", () => {
  test("A: 25.6평 × 200 + 34.6평 × 320 = 5,120 + 11,072 = 16,192.0평 · 520세대", () => {
    assertClose(totalSupplyPyeong(rowsOf("A")), 16192);
    assert.equal(totalHouseholds(rowsOf("A")), 520);
  });

  test("B: 25.4평 × 300 + 34.3평 × 480 = 7,620 + 16,464 = 24,084.0평 · 780세대", () => {
    assertClose(totalSupplyPyeong(rowsOf("B")), 24084);
    assert.equal(totalHouseholds(rowsOf("B")), 780);
  });

  test("C: 30.8평 × 140 + 34.5평 × 240 = 4,312 + 8,280 = 12,592.0평 · 380세대", () => {
    assertClose(totalSupplyPyeong(rowsOf("C")), 12592);
    assert.equal(totalHouseholds(rowsOf("C")), 380);
  });
});

describe("빈 입력 처리", () => {
  test("빈 폼은 합계가 null (자료 없음)", () => {
    const input = emptyPlanInput("row-1");
    assert.equal(totalSupplyPyeong(input.unitTypes), null);
    assert.equal(totalHouseholds(input.unitTypes), null);
    assert.equal(input.pricePerPyeong, null);
  });

  test("완전히 빈 행은 합계에서 무시", () => {
    const rows = [...rowsOf("A"), emptyUnitType("blank")];
    assertClose(totalSupplyPyeong(rows), 16192);
    assert.equal(totalHouseholds(rows), 520);
  });

  test("일부만 입력된 행이 있으면 null", () => {
    const partial: UnitType = { ...emptyUnitType("partial"), name: "99㎡", households: 10 };
    const rows = [...rowsOf("A"), partial];
    assert.equal(totalSupplyPyeong(rows), null);
    assert.equal(totalHouseholds(rows), 530);
  });

  test("0은 null과 달리 입력값으로 취급", () => {
    const zero: UnitType = { ...emptyUnitType("zero"), supplyPyeong: 0, households: 0 };
    assert.equal(totalSupplyPyeong([zero]), 0);
    assert.equal(totalHouseholds([zero]), 0);
  });
});

/** 소수 자리 반올림 */
function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** 프리셋 키로 계산 결과를 꺼낸다 */
function planOf(key: "A" | "B" | "C") {
  const preset = PRESETS.find((p) => p.key === key);
  assert.ok(preset);
  const result = calculatePlan(preset.input);
  assert.ok(result, `plan ${key} should be computable`);
  return result;
}

describe("사업수지 — 샘플 A 검산 기준값", () => {
  const a = planOf("A");

  test("분양수입 = 16,192평 × 2,420만원 ÷ 10,000 + 상가 150 = 3,918.464 + 150 = 4,068.464억", () => {
    assertClose(a.revenue, 4068.464, 1e-9);
  });

  test("기말현금 = 4,068.464 × 0.992 − 520 × 0.03 + 175 − 3,815 = 4,035.916288 − 15.6 + 175 − 3,815 = +380.316288 → +380.3억", () => {
    assertClose(a.endingCash, 380.316288, 1e-9);
    assert.equal(round(a.endingCash, 1), 380.3);
  });

  test("DSCR = 1 + (380.316288 + 400) ÷ (2,450 + 480) = 1 + 780.316288 ÷ 2,930 = 1.2663 → 1.27", () => {
    assertClose(a.dscr, 1 + 780.316288 / 2930, 1e-9);
    assert.equal(round(a.dscr!, 2), 1.27);
  });

  test("LTV = 2,450 ÷ 4,068.464 = 0.60219 → 60.2%", () => {
    assertClose(a.ltv, 2450 / 4068.464, 1e-12);
    assert.equal(round(a.ltv! * 100, 1), 60.2);
  });

  test("기말현금 0 분양률: 4,020.316288 r − 3,640 = 0 → r = 0.90540 → 90.5%", () => {
    // 기말현금(r) = (4,068.464 × 0.992 − 520 × 0.03) r + 175 − 3,815
    assertClose(a.zeroCashLimit.salesRate, 3640 / 4020.316288, 1e-8);
    assert.equal(round(a.zeroCashLimit.salesRate! * 100, 1), 90.5);
  });

  test("기말현금 0 평당가: 1.6062464 p − 3,506.8 = 0 → p = 2,183.2 → 2,183만원", () => {
    // 기말현금(p) = (16,192 p ÷ 10,000 + 150) × 0.992 − 15.6 + 175 − 3,815
    assertClose(a.zeroCashLimit.price, 3506.8 / 1.6062464, 1e-5);
    assert.equal(Math.round(a.zeroCashLimit.price!), 2183);
  });

  test("상환 한계 분양률: 4,020.316288 r − 3,640 = −400 → r = 3,240 ÷ 4,020.316288 = 0.80591 → 80.6%", () => {
    assertClose(a.repaymentLimit.salesRate, 3240 / 4020.316288, 1e-8);
    assert.equal(round(a.repaymentLimit.salesRate! * 100, 1), 80.6);
  });

  test("상환 한계 평당가: 1.6062464 p − 3,506.8 = −400 → p = 3,106.8 ÷ 1.6062464 = 1,934.2 → 1,934만원", () => {
    assertClose(a.repaymentLimit.price, 3106.8 / 1.6062464, 1e-5);
    assert.equal(Math.round(a.repaymentLimit.price!), 1934);
    assert.equal(a.repayable, true);
  });

  test("폭포: 4,068.464 → 변동비 −(32.547712 + 15.6) → 고정비 −3,815 → 기타유입 +175 → 기말현금 380.316288", () => {
    const [revenue, variable, fixed, other, cash] = a.waterfall;
    assertClose(revenue.to, 4068.464);
    assertClose(variable.amount, -48.147712, 1e-9);
    assertClose(variable.to, 4020.316288, 1e-9);
    assertClose(fixed.to, 205.316288, 1e-9);
    assertClose(other.to, 380.316288, 1e-9);
    assertClose(cash.to, 380.316288, 1e-9);
    // 각 칸은 앞 칸이 끝난 곳에서 시작한다
    assert.equal(variable.from, revenue.to);
    assert.equal(fixed.from, variable.to);
    assert.equal(other.from, fixed.to);
  });

  test("우리 84㎡ 세대당 분양가 = 34.6평 × 2,420만원 = 83,732만원", () => {
    const preset = PRESETS.find((p) => p.key === "A")!;
    assertClose(our84UnitPrice(preset.input), 83732, 1e-9);
  });
});

describe("사업수지 — 임시 값 표의 기말현금", () => {
  test("B: (24,084 × 2,650 ÷ 10,000 + 180) × 0.992 − 780 × 0.03 + 260 − 6,296.4 = 449.96192 → +450.0억", () => {
    const b = planOf("B");
    assertClose(b.endingCash, 449.96192, 1e-9);
    assert.equal(round(b.endingCash, 1), 450.0);
  });

  test("C: (12,592 × 1,980 ÷ 10,000 + 90) × 0.992 − 380 × 0.03 + 120 − 2,461.2 = 209.950272 → +210.0억", () => {
    const c = planOf("C");
    assertClose(c.endingCash, 209.950272, 1e-9);
    assert.equal(round(c.endingCash, 1), 210.0);
  });
});

describe("사업수지 — 경계값", () => {
  test("입력이 하나라도 비면 null (자료 없음)", () => {
    const input = structuredClone(PRESETS[0].input);
    input.subordinated = null;
    assert.equal(calculatePlan(input), null);
    assert.equal(calculatePlan(emptyPlanInput("x")), null);
  });

  test("분양률 100%로도 기말현금 0에 못 미치면 한계 분양률은 null", () => {
    const input = structuredClone(PRESETS[0].input);
    input.fixedCost = 10_000;
    const result = calculatePlan(input)!;
    assert.equal(result.zeroCashLimit.salesRate, null);
    assert.equal(result.repayable, false);
  });

  test("이분법: x² − 2 = 0 → √2", () => {
    assertClose(bisect((x) => x * x - 2, 0, 2), Math.SQRT2, 1e-8);
    assert.equal(bisect((x) => x - 5, 0, 1), null);
    assert.equal(bisect((x) => x + 1, 0, 1), 0);
  });

  test("본PF·금융비용 합이 0이면 DSCR null, 분양수입 0이면 LTV null", () => {
    const input = structuredClone(PRESETS[0].input);
    input.seniorPf = 0;
    input.seniorPfFinanceCost = 0;
    assert.equal(calculatePlan(input)!.dscr, null);
    input.pricePerPyeong = 0;
    input.retail = 0;
    assert.equal(calculatePlan(input)!.ltv, null);
  });
});
