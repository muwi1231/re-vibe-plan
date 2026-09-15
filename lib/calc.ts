/**
 * 사업계획서 입력 타입과 계산 함수.
 *
 * 단위 규칙
 * - 금액: 억원. 평당가(pricePerPyeong)만 만원.
 * - 면적: 전용면적은 ㎡, 공급면적은 평.
 * - 입력하지 않은 숫자는 null (0과 구분해 "자료 없음"을 표시하기 위함).
 *
 * 이 파일은 React·Next·브라우저 API에 의존하지 않는다. (node --test 로 바로 실행)
 */

/** 주택형 표의 한 행 */
export type UnitType = {
  id: string;
  /** 주택형 이름 (예: 84㎡) */
  name: string;
  /** 전용면적 ㎡ */
  exclusiveM2: number | null;
  /** 세대당 공급면적 평 */
  supplyPyeong: number | null;
  /** 세대수 */
  households: number | null;
};

/** 사업계획서 입력값 전체 */
export type PlanInput = {
  projectName: string;
  /** 시도 전체 이름 (예: 경기도) */
  sido: string;
  /** 시군구 전체 이름 (예: 수원시 영통구) */
  sigungu: string;
  unitTypes: UnitType[];
  /** 평당 분양가(공급면적 기준), 만원 */
  pricePerPyeong: number | null;
  /** 상가 분양수입, 억원 */
  retail: number | null;
  /** 기타유입, 억원 */
  otherInflow: number | null;
  /** 고정비, 억원 */
  fixedCost: number | null;
  /** 본PF, 억원 */
  seniorPf: number | null;
  /** 본PF 금융비용, 억원 */
  seniorPfFinanceCost: number | null;
  /** 후순위, 억원 */
  subordinated: number | null;
};

/** 시도 전체 이름 목록 (행정구역 17개) */
export const SIDO_NAMES = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
] as const;

/** 빈 주택형 행을 만든다. id는 호출하는 쪽에서 고유하게 넘긴다. */
export function emptyUnitType(id: string): UnitType {
  return { id, name: "", exclusiveM2: null, supplyPyeong: null, households: null };
}

/** 처음 화면에 보여줄 빈 입력값을 만든다. 주택형 표는 빈 행 1개로 시작한다. */
export function emptyPlanInput(firstRowId: string): PlanInput {
  return {
    projectName: "",
    sido: "",
    sigungu: "",
    unitTypes: [emptyUnitType(firstRowId)],
    pricePerPyeong: null,
    retail: null,
    otherInflow: null,
    fixedCost: null,
    seniorPf: null,
    seniorPfFinanceCost: null,
    subordinated: null,
  };
}

/** 이름과 숫자가 모두 비어 있는 행인지 확인한다. 이런 행은 합계에서 무시한다. */
export function isBlankUnitType(row: UnitType): boolean {
  return (
    row.name.trim() === "" &&
    row.exclusiveM2 === null &&
    row.supplyPyeong === null &&
    row.households === null
  );
}

/**
 * 합계에 쓸 행을 고른다.
 * 완전히 빈 행은 빼고, 남은 행 중 하나라도 필요한 값이 비어 있으면 null(자료 없음)을 돌려준다.
 */
function rowsForTotal(rows: UnitType[], required: (keyof UnitType)[]): UnitType[] | null {
  const filled = rows.filter((row) => !isBlankUnitType(row));
  if (filled.length === 0) return null;
  const complete = filled.every((row) => required.every((key) => row[key] !== null));
  return complete ? filled : null;
}

/**
 * 공급면적 합계(평) = Σ(세대당 공급면적 × 세대수).
 * 입력이 부족하면 null.
 */
export function totalSupplyPyeong(rows: UnitType[]): number | null {
  const used = rowsForTotal(rows, ["supplyPyeong", "households"]);
  if (used === null) return null;
  return used.reduce((acc, row) => acc + row.supplyPyeong! * row.households!, 0);
}

/**
 * 세대수 합계 = Σ세대수.
 * 입력이 부족하면 null.
 */
export function totalHouseholds(rows: UnitType[]): number | null {
  const used = rowsForTotal(rows, ["households"]);
  if (used === null) return null;
  return used.reduce((acc, row) => acc + row.households!, 0);
}

// ─────────────────────────────────────────────────────────────
// 사업수지 계산 — 분양률 r(0~1), 평당가 p(만원)
// ─────────────────────────────────────────────────────────────

/** 1㎡ = 0.3025평 (1평 = 400/121㎡) */
export const PYEONG_PER_M2 = 0.3025;

/** 분양수입 중 기말현금으로 남는 비율 (1 − 0.8%) */
export const SALES_RETAIN_RATE = 0.992;

/** 분양된 세대당 변동비, 억원 */
export const VARIABLE_COST_PER_HOUSEHOLD = 0.03;

/** 전용 84㎡형으로 보는 전용면적 범위(㎡, 양끝 포함) */
export const BAND_84 = { min: 80, max: 85 } as const;

/** 전용면적이 84㎡형 범위에 드는지 확인한다. */
export function isBand84(exclusiveM2: number): boolean {
  return exclusiveM2 >= BAND_84.min && exclusiveM2 <= BAND_84.max;
}

/** 계산에 필요한 입력값이 모두 채워진 상태 */
export type PlanFigures = {
  /** 공급면적 합계, 평 */
  supplyPyeong: number;
  households: number;
  /** 계획 평당가, 만원 */
  pricePerPyeong: number;
  retail: number;
  otherInflow: number;
  fixedCost: number;
  seniorPf: number;
  seniorPfFinanceCost: number;
  subordinated: number;
};

/** 입력값에서 계산용 숫자를 모은다. 하나라도 비어 있으면 null(자료 없음). */
export function toPlanFigures(input: PlanInput): PlanFigures | null {
  const supplyPyeong = totalSupplyPyeong(input.unitTypes);
  const households = totalHouseholds(input.unitTypes);
  const values = [
    supplyPyeong,
    households,
    input.pricePerPyeong,
    input.retail,
    input.otherInflow,
    input.fixedCost,
    input.seniorPf,
    input.seniorPfFinanceCost,
    input.subordinated,
  ];
  if (values.some((v) => v === null)) return null;
  return {
    supplyPyeong: supplyPyeong!,
    households: households!,
    pricePerPyeong: input.pricePerPyeong!,
    retail: input.retail!,
    otherInflow: input.otherInflow!,
    fixedCost: input.fixedCost!,
    seniorPf: input.seniorPf!,
    seniorPfFinanceCost: input.seniorPfFinanceCost!,
    subordinated: input.subordinated!,
  };
}

/** 분양수입(억원) = (공급면적 × p ÷ 10,000 + 상가) × r */
export function salesRevenue(f: PlanFigures, r: number, p: number = f.pricePerPyeong): number {
  return ((f.supplyPyeong * p) / 10_000 + f.retail) * r;
}

/** 변동비(억원) = 분양수입 × (1 − 0.992) + 세대수 × r × 0.03 */
export function variableCost(f: PlanFigures, r: number, p: number = f.pricePerPyeong): number {
  return (
    salesRevenue(f, r, p) * (1 - SALES_RETAIN_RATE) +
    f.households * r * VARIABLE_COST_PER_HOUSEHOLD
  );
}

/** 기말현금(억원) = 분양수입 × 0.992 − 세대수 × r × 0.03 + 기타유입 − 고정비 */
export function endingCash(f: PlanFigures, r: number, p: number = f.pricePerPyeong): number {
  return (
    salesRevenue(f, r, p) * SALES_RETAIN_RATE -
    f.households * r * VARIABLE_COST_PER_HOUSEHOLD +
    f.otherInflow -
    f.fixedCost
  );
}

/**
 * 만기 누적 DSCR(분양률 100%) = 1 + (기말현금 + 후순위) ÷ (본PF + 본PF 금융비용).
 * 분모가 0이면 null.
 */
export function maturityDscr(f: PlanFigures): number | null {
  const debt = f.seniorPf + f.seniorPfFinanceCost;
  if (debt === 0) return null;
  return 1 + (endingCash(f, 1) + f.subordinated) / debt;
}

/** LTV = 본PF ÷ 분양수입(r = 1). 분양수입이 0이면 null. */
export function loanToValue(f: PlanFigures): number | null {
  const revenue = salesRevenue(f, 1);
  if (revenue === 0) return null;
  return f.seniorPf / revenue;
}

/**
 * 이분법으로 증가함수 fn의 fn(x) = 0 인 x를 [lo, hi]에서 찾는다.
 * fn(lo) ≥ 0 이면 lo, fn(hi) < 0 이면 범위 안에 답이 없으므로 null.
 */
export function bisect(
  fn: (x: number) => number,
  lo: number,
  hi: number,
  tolerance = 1e-9,
  maxIterations = 200,
): number | null {
  if (fn(lo) >= 0) return lo;
  if (fn(hi) < 0) return null;
  let low = lo;
  let high = hi;
  for (let i = 0; i < maxIterations && high - low > tolerance; i++) {
    const mid = (low + high) / 2;
    if (fn(mid) >= 0) high = mid;
    else low = mid;
  }
  return high;
}

/**
 * 분양률 한계선: 계획 평당가에서 기말현금이 target 이상이 되는 최소 분양률(0~1).
 * 분양률 100%로도 못 미치면 null.
 */
export function breakEvenSalesRate(f: PlanFigures, target: number): number | null {
  return bisect((r) => endingCash(f, r) - target, 0, 1);
}

/**
 * 평당가 한계선: 분양률 100%에서 기말현금이 target 이상이 되는 최소 평당가(만원).
 * 공급면적이 0이면 평당가로 바꿀 수 없으므로 null.
 */
export function breakEvenPrice(f: PlanFigures, target: number): number | null {
  if (f.supplyPyeong <= 0) return null;
  const upper = Math.max(f.pricePerPyeong * 10, 100_000);
  return bisect((p) => endingCash(f, 1, p) - target, 0, upper, 1e-6);
}

/** 폭포 차트 한 칸: from → to 로 이동 (억원) */
export type WaterfallStep = {
  label: string;
  kind: "total" | "increase" | "decrease";
  /** 이 칸이 나타내는 금액 (감소는 음수) */
  amount: number;
  from: number;
  to: number;
  formula: string;
};

/** 계획(분양률 100%) 기준 사업수지 결과 */
export type PlanResult = {
  figures: PlanFigures;
  revenue: number;
  variableCost: number;
  endingCash: number;
  dscr: number | null;
  ltv: number | null;
  /** 기말현금 0 한계 */
  zeroCashLimit: { salesRate: number | null; price: number | null };
  /** 상환 한계(기말현금 = −후순위) */
  repaymentLimit: { salesRate: number | null; price: number | null };
  /** 기말현금 ≥ −후순위 이면 본PF 상환 가능 */
  repayable: boolean;
  waterfall: WaterfallStep[];
};

/** 입력값으로 계획 기준 사업수지를 계산한다. 입력이 부족하면 null. */
export function calculatePlan(input: PlanInput): PlanResult | null {
  const f = toPlanFigures(input);
  if (f === null) return null;

  const revenue = salesRevenue(f, 1);
  const variable = variableCost(f, 1);
  const cash = endingCash(f, 1);

  const afterVariable = revenue - variable;
  const afterFixed = afterVariable - f.fixedCost;
  const waterfall: WaterfallStep[] = [
    {
      label: "분양수입",
      kind: "total",
      amount: revenue,
      from: 0,
      to: revenue,
      formula: "공급면적 × 평당가 ÷ 10,000 + 상가",
    },
    {
      label: "변동비",
      kind: "decrease",
      amount: -variable,
      from: revenue,
      to: afterVariable,
      formula: "분양수입 × 0.8% + 세대수 × 0.03",
    },
    {
      label: "고정비",
      kind: "decrease",
      amount: -f.fixedCost,
      from: afterVariable,
      to: afterFixed,
      formula: "입력값",
    },
    {
      label: "기타유입",
      kind: "increase",
      amount: f.otherInflow,
      from: afterFixed,
      to: afterFixed + f.otherInflow,
      formula: "입력값",
    },
    {
      label: "기말현금",
      kind: "total",
      amount: cash,
      from: 0,
      to: cash,
      formula: "분양수입 × 0.992 − 세대수 × 0.03 + 기타유입 − 고정비",
    },
  ];

  return {
    figures: f,
    revenue,
    variableCost: variable,
    endingCash: cash,
    dscr: maturityDscr(f),
    ltv: loanToValue(f),
    zeroCashLimit: { salesRate: breakEvenSalesRate(f, 0), price: breakEvenPrice(f, 0) },
    repaymentLimit: {
      salesRate: breakEvenSalesRate(f, -f.subordinated),
      price: breakEvenPrice(f, -f.subordinated),
    },
    repayable: cash >= -f.subordinated,
    waterfall,
  };
}

/**
 * 우리 사업 84㎡형 세대당 분양가(만원) = 84㎡형 주택형들의 세대수 가중 평균 공급평 × 계획 평당가.
 * 84㎡형 행이 없거나 값이 비어 있으면 null.
 */
export function our84UnitPrice(input: PlanInput): number | null {
  if (input.pricePerPyeong === null) return null;
  const rows = input.unitTypes.filter(
    (row) =>
      row.exclusiveM2 !== null &&
      isBand84(row.exclusiveM2) &&
      row.supplyPyeong !== null &&
      row.households !== null &&
      row.households > 0,
  );
  const households = rows.reduce((acc, row) => acc + row.households!, 0);
  if (households === 0) return null;
  const weightedPyeong =
    rows.reduce((acc, row) => acc + row.supplyPyeong! * row.households!, 0) / households;
  return weightedPyeong * input.pricePerPyeong;
}
