/** 차트 색 — 모든 차트에서 고정 */
export const CHART_COLORS = {
  /** 계획가·우리 사업 */
  plan: "#1d4ed8",
  /** 시장 자료 */
  market: "#9ca3af",
  /** 상환 가능 */
  ok: "#16a34a",
  /** 상환 불가 · 음수 */
  bad: "#dc2626",
  /** 축·보조선 (자료 아님) */
  axis: "#a1a1aa",
  grid: "#e4e4e7",
  text: "#3f3f46",
} as const;

/** min~max를 모두 덮으면서 5칸 안팎으로 나누는 보기 좋은 눈금 목록 (첫 눈금 ≤ min, 끝 눈금 ≥ max) */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min - 1, min, min + 1];
  const rawStep = (max - min) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep)!;
  const first = Math.floor(min / step) * step;
  const last = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let i = 0; first + i * step <= last + step * 1e-9; i++) {
    ticks.push(Number((first + i * step).toFixed(10)));
  }
  return ticks;
}
