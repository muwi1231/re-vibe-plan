"use client";

import type { WaterfallStep } from "@/lib/calc";
import { formatEokSigned, formatNumber } from "@/lib/format";
import { ChartFrame } from "./ChartFrame";
import { CHART_COLORS, niceTicks } from "./chartTheme";

type Props = {
  /** lib/calc calculatePlan().waterfall — null이면 자료 없음 */
  steps: WaterfallStep[] | null;
  /** 기말현금 ≥ −후순위 (상환 가능) */
  repayable: boolean;
};

/** 사업수지 폭포 차트: 분양수입 → 변동비 → 고정비 → 기타유입 → 기말현금 */
export function WaterfallChart({ steps, repayable }: Props) {
  return (
    <ChartFrame
      title="사업수지 폭포 — 분양수입에서 기말현금까지 (분양률 100%)"
      unit="억원"
      count={steps ? `${steps.length}개 항목` : "0"}
      fetchedAt="해당 없음 (입력값 계산)"
      source="입력값 · lib/calc"
      empty={steps === null}
      chart={(width) => <WaterfallSvg steps={steps!} repayable={repayable} width={width} />}
      table={<WaterfallTable steps={steps ?? []} />}
    />
  );
}

/** 막대 색: 분양수입은 계획 강조색, 증감은 회색, 기말현금은 상환 가능 초록/불가 빨강 */
function barColor(step: WaterfallStep, index: number, last: number, repayable: boolean): string {
  if (index === 0) return CHART_COLORS.plan;
  if (index === last) return repayable ? CHART_COLORS.ok : CHART_COLORS.bad;
  return CHART_COLORS.market;
}

/** 폭포 차트 SVG */
function WaterfallSvg({
  steps,
  repayable,
  width,
}: {
  steps: WaterfallStep[];
  repayable: boolean;
  width: number;
}) {
  const height = 300;
  const margin = { top: 28, right: 12, bottom: 44, left: 56 };
  const plotW = Math.max(width - margin.left - margin.right, 10);
  const plotH = height - margin.top - margin.bottom;

  const values = steps.flatMap((s) => [s.from, s.to]);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const y = (v: number) => margin.top + ((yMax - v) / (yMax - yMin || 1)) * plotH;

  const slot = plotW / steps.length;
  const barW = Math.min(64, slot * 0.6);
  const fontSize = width < 420 ? 10 : 12;
  const last = steps.length - 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="사업수지 폭포 차트"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={margin.left}
            x2={width - margin.right}
            y1={y(t)}
            y2={y(t)}
            stroke={t === 0 ? CHART_COLORS.axis : CHART_COLORS.grid}
          />
          <text
            x={margin.left - 6}
            y={y(t)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={fontSize}
            fill={t < 0 ? CHART_COLORS.bad : CHART_COLORS.text}
          >
            {formatNumber(t)}
          </text>
        </g>
      ))}

      {steps.map((step, i) => {
        const cx = margin.left + slot * i + slot / 2;
        const top = y(Math.max(step.from, step.to));
        const bottom = y(Math.min(step.from, step.to));
        const next = steps[i + 1];
        return (
          <g key={step.label}>
            <rect
              x={cx - barW / 2}
              y={top}
              width={barW}
              height={Math.max(bottom - top, 1)}
              fill={barColor(step, i, last, repayable)}
            />
            {next && next.kind !== "total" && (
              <line
                x1={cx + barW / 2}
                x2={cx + slot - barW / 2}
                y1={y(step.to)}
                y2={y(step.to)}
                stroke={CHART_COLORS.axis}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={cx}
              y={top - 6}
              textAnchor="middle"
              fontSize={fontSize}
              fontWeight={600}
              fill={step.amount < 0 ? CHART_COLORS.bad : CHART_COLORS.text}
            >
              {formatEokSigned(step.amount)}
            </text>
            <text
              x={cx}
              y={height - margin.bottom + 18}
              textAnchor="middle"
              fontSize={fontSize}
              fill={CHART_COLORS.text}
            >
              {step.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** [표로 보기] — 항목 · 금액 · 누계 · 수식 */
function WaterfallTable({ steps }: { steps: WaterfallStep[] }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-zinc-300 text-xs text-zinc-600">
          <th className="px-2 py-1 text-left">항목</th>
          <th className="px-2 py-1 text-right">금액(억원)</th>
          <th className="px-2 py-1 text-right">누계(억원)</th>
          <th className="px-2 py-1 text-left">수식</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step) => (
          <tr key={step.label} className="border-b border-zinc-100">
            <td className="px-2 py-1">{step.label}</td>
            <td className={`px-2 py-1 text-right ${step.amount < 0 ? "text-red-600" : ""}`}>
              {formatNumber(step.amount, 1)}
            </td>
            <td className={`px-2 py-1 text-right ${step.to < 0 ? "text-red-600" : ""}`}>
              {formatNumber(step.to, 1)}
            </td>
            <td className="px-2 py-1 text-xs text-zinc-500">{step.formula}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
