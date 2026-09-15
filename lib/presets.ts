import type { PlanInput } from "./calc.ts";

/**
 * 검증용 임시 값 3개. 실제 사업장이 아니다.
 * 값은 사용자가 준 표 그대로이며, 시도만 전체 이름으로 적었다.
 * 금액은 억원, 평당가는 만원.
 */
export type Preset = {
  key: "A" | "B" | "C";
  label: string;
  input: PlanInput;
};

export const PRESETS: Preset[] = [
  {
    key: "A",
    label: "A 해운대 그린테라스",
    input: {
      projectName: "해운대 그린테라스",
      sido: "부산광역시",
      sigungu: "해운대구",
      unitTypes: [
        { id: "A-59", name: "59㎡", exclusiveM2: 59.9, supplyPyeong: 25.6, households: 200 },
        { id: "A-84", name: "84㎡", exclusiveM2: 84.9, supplyPyeong: 34.6, households: 320 },
      ],
      pricePerPyeong: 2420,
      retail: 150,
      otherInflow: 175,
      fixedCost: 3815.0,
      seniorPf: 2450,
      seniorPfFinanceCost: 480,
      subordinated: 400,
    },
  },
  {
    key: "B",
    label: "B 영통 센트럴파크",
    input: {
      projectName: "영통 센트럴파크",
      sido: "경기도",
      sigungu: "수원시 영통구",
      unitTypes: [
        { id: "B-59", name: "59㎡", exclusiveM2: 59.8, supplyPyeong: 25.4, households: 300 },
        { id: "B-84", name: "84㎡", exclusiveM2: 84.9, supplyPyeong: 34.3, households: 480 },
      ],
      pricePerPyeong: 2650,
      retail: 180,
      otherInflow: 260,
      fixedCost: 6296.4,
      seniorPf: 4100,
      seniorPfFinanceCost: 820,
      subordinated: 600,
    },
  },
  {
    key: "C",
    label: "C 유성 리버뷰",
    input: {
      projectName: "유성 리버뷰",
      sido: "대전광역시",
      sigungu: "유성구",
      unitTypes: [
        { id: "C-74", name: "74㎡", exclusiveM2: 74.6, supplyPyeong: 30.8, households: 140 },
        { id: "C-84", name: "84㎡", exclusiveM2: 84.9, supplyPyeong: 34.5, households: 240 },
      ],
      pricePerPyeong: 1980,
      retail: 90,
      otherInflow: 120,
      fixedCost: 2461.2,
      seniorPf: 1650,
      seniorPfFinanceCost: 330,
      subordinated: 260,
    },
  },
];
