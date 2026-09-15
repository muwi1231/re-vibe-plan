"use client";

import type { MarketMargin, NewSupplyRow } from "@/lib/market";
import { formatManwon, formatNumber, formatPct } from "@/lib/format";
import { ChartFrame } from "./ChartFrame";
import { CHART_COLORS, niceTicks } from "./chartTheme";

type Props = {
  /** lib/market buildNewSupplyTable().rows */
  rows: NewSupplyRow[];
  /** 계획 평당가, 만원 */
  planPrice: number | null;
  /** lib/calc 상환 한계 평당가, 만원 */
  repaymentLimitPrice: number | null;
  /** lib/market buildMarketMargin() */
  margin: MarketMargin | null;
  area: string;
  fetchedAt: string;
  source: string;
};

/** 시장 대비 여유: 인근 신규 84㎡ 공급평당가 점 분포 + 계획가 선 + 상환 한계 평당가 선 */
export function MarketMarginChart(props: Props) {
  const { rows, margin, area, fetchedAt, source } = props;
  return (
    <ChartFrame
      title={`시장 대비 여유 — ${area} 인근 신규 84㎡ 공급평당가 · 계획가 · 상환 한계${
        margin ? ` (여유 ${formatPct(margin.marginPct)})` : ""
      }`}
      unit="만원/평 (공급면적 기준)"
      count={`주택형 ${formatNumber(rows.length)}개`}
      fetchedAt={fetchedAt}
      source={source}
      empty={rows.length === 0}
      chart={(width) => <MarginSvg {...props} width={width} />}
      table={<MarginTable {...props} />}
    />
  );
}

/** 점 분포 SVG — 단지마다 한 줄, 주택형마다 점 하나 */
function MarginSvg({
  rows,
  planPrice,
  repaymentLimitPrice,
  width,
}: Props & { width: number }) {
  const complexes = [...new Set(rows.map((r) => r.houseNm))];
  const narrow = width < 480;
  const fontSize = narrow ? 10 : 12;
  const rowH = 26;
  const margin = { top: 40, right: 16, bottom: 36, left: narrow ? 96 : 168 };
  const height = margin.top + complexes.length * rowH + margin.bottom;
  const plotW = Math.max(width - margin.left - margin.right, 10);

  const xs = [
    ...rows.map((r) => r.pricePerPyeong),
    ...(planPrice !== null ? [planPrice] : []),
    ...(repaymentLimitPrice !== null ? [repaymentLimitPrice] : []),
  ];
  const ticks = niceTicks(Math.min(...xs) * 0.95, Math.max(...xs) * 1.05);
  const xMin = ticks[0];
  const xMax = ticks[ticks.length - 1];
  const x = (v: number) => margin.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const plotBottom = height - margin.bottom;

  const lines: { value: number; label: string; color: string; dash?: string }[] = [];
  if (repaymentLimitPrice !== null) {
    lines.push({ value: repaymentLimitPrice, label: "상환 한계", color: CHART_COLORS.bad, dash: "5 4" });
  }
  if (planPrice !== null) {
    lines.push({ value: planPrice, label: "계획가", color: CHART_COLORS.plan });
  }
  // 두 선의 이름표가 가까우면 한 줄 내린다
  const labelRows = lines.map((l, i) =>
    i > 0 && Math.abs(x(l.value) - x(lines[0].value)) < 90 ? 1 : 0,
  );

  const truncate = (name: string) => {
    const max = narrow ? 7 : 13;
    return name.length > max ? `${name.slice(0, max)}…` : name;
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="시장 대비 여유 점 분포">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={margin.top} y2={plotBottom} stroke={CHART_COLORS.grid} />
          <text x={x(t)} y={plotBottom + 16} textAnchor="middle" fontSize={fontSize} fill={CHART_COLORS.text}>
            {formatNumber(t)}
          </text>
        </g>
      ))}

      {complexes.map((name, i) => {
        const cy = margin.top + i * rowH + rowH / 2;
        return (
          <g key={name}>
            <text x={margin.left - 8} y={cy} textAnchor="end" dominantBaseline="middle" fontSize={fontSize} fill={CHART_COLORS.text}>
              <title>{name}</title>
              {truncate(name)}
            </text>
            {rows
              .filter((r) => r.houseNm === name)
              .map((r) => (
                <circle
                  key={`${r.houseTy}-${r.recruitDate}`}
                  cx={x(r.pricePerPyeong)}
                  cy={cy}
                  r={5}
                  fill={CHART_COLORS.market}
                  fillOpacity={0.85}
                  stroke="#fff"
                >
                  <title>{`${name} ${r.houseTy}: ${formatManwon(r.pricePerPyeong)}`}</title>
                </circle>
              ))}
          </g>
        );
      })}

      {lines.map((l, i) => (
        <g key={l.label}>
          <line
            x1={x(l.value)}
            x2={x(l.value)}
            y1={margin.top - 6}
            y2={plotBottom}
            stroke={l.color}
            strokeWidth={2}
            strokeDasharray={l.dash}
          />
          <text
            x={x(l.value)}
            y={margin.top - 24 + labelRows[i] * 13}
            textAnchor="middle"
            fontSize={fontSize}
            fontWeight={600}
            fill={l.color}
          >
            {`${l.label} ${formatNumber(l.value)}`}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** [표로 보기] — 단지 · 주택형 · 공급평당가 + 계획가 · 상환 한계 */
function MarginTable({ rows, planPrice, repaymentLimitPrice, margin }: Props) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-zinc-300 text-xs text-zinc-600">
          <th className="px-2 py-1 text-left">단지</th>
          <th className="px-2 py-1 text-left">주택형</th>
          <th className="px-2 py-1 text-right">공급평당가(만원)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.houseNm}-${r.houseTy}-${r.recruitDate}`} className="border-b border-zinc-100">
            <td className="px-2 py-1">{r.houseNm}</td>
            <td className="px-2 py-1">{r.houseTy}</td>
            <td className="px-2 py-1 text-right">{formatNumber(r.pricePerPyeong)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="text-xs">
        <tr>
          <td className="px-2 py-1 font-semibold text-blue-700" colSpan={2}>계획가</td>
          <td className="px-2 py-1 text-right">{planPrice === null ? "자료 없음" : formatNumber(planPrice)}</td>
        </tr>
        <tr>
          <td className="px-2 py-1 font-semibold text-red-600" colSpan={2}>상환 한계 평당가</td>
          <td className="px-2 py-1 text-right">
            {repaymentLimitPrice === null ? "자료 없음" : formatNumber(repaymentLimitPrice)}
          </td>
        </tr>
        <tr>
          <td className="px-2 py-1 font-semibold" colSpan={2}>
            시장 대비 여유 = (시장 중위 − 상환 한계) ÷ 시장 중위
          </td>
          <td className={`px-2 py-1 text-right ${margin && margin.marginPct < 0 ? "text-red-600" : ""}`}>
            {margin ? formatPct(margin.marginPct) : "자료 없음"}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
