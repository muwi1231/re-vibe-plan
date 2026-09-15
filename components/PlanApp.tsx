"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  SIDO_NAMES,
  calculatePlan,
  emptyPlanInput,
  emptyUnitType,
  totalHouseholds,
  totalSupplyPyeong,
  type PlanInput,
  type PlanResult,
  type UnitType,
} from "@/lib/calc";
import { formatEokSigned, formatManwon, formatNumber, formatPct, formatRatioPct } from "@/lib/format";
import { splitArea, type MarketMargin } from "@/lib/market";
import { PRESETS } from "@/lib/presets";
import { WaterfallChart } from "./charts/WaterfallChart";
import { MarketAnalysis } from "./MarketAnalysis";
import { summarizeMarket, useMarketData } from "./useMarketData";

type NumericKey = {
  [K in keyof PlanInput]: PlanInput[K] extends number | null ? K : never;
}[keyof PlanInput];

type UnitTypeNumericKey = "exclusiveM2" | "supplyPyeong" | "households";

const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 });
const oneDecimalFormat = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 입력창 표시용: 천단위 콤마, 비어 있으면 빈 문자열 */
function formatInput(value: number | null): string {
  return value === null ? "" : numberFormat.format(value);
}

/** 입력 문자열을 숫자로 바꾼다. 빈 값은 null, 해석할 수 없으면 undefined */
function parseInput(text: string): number | null | undefined {
  const cleaned = text.replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** 입력 · 결과 화면 */
export function PlanApp() {
  const [input, setInput] = useState<PlanInput>(() => emptyPlanInput("row-1"));

  const supplyTotal = totalSupplyPyeong(input.unitTypes);
  const householdTotal = totalHouseholds(input.unitTypes);
  const plan = useMemo(() => calculatePlan(input), [input]);
  const market = useMarketData();
  const summary = useMemo(
    () => (market.state ? summarizeMarket(market.state, input, plan) : null),
    [market.state, input, plan],
  );
  const area = input.sido && input.sigungu.trim() ? `${input.sido} ${input.sigungu.trim()}` : "";

  /** 지역 후보를 고르면 시도·시군구를 바꾸고 다시 조회한다 */
  function pickRegion(name: string) {
    const parts = splitArea(name);
    if (!parts) return;
    setInput((prev) => ({ ...prev, sido: parts.sido, sigungu: parts.sigungu }));
    void market.start(name);
  }

  /** 상단 숫자 입력값 하나를 바꾼다 */
  function setNumber(key: NumericKey, value: number | null) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  /** 주택형 표의 한 행을 바꾼다 */
  function updateRow(id: string, patch: Partial<UnitType>) {
    setInput((prev) => ({
      ...prev,
      unitTypes: prev.unitTypes.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 print:max-w-none print:p-0">
      <header className="mb-5 print:hidden">
        <p className="text-xs tracking-widest text-zinc-500">대주단 제출용</p>
        <h1 className="text-xl font-bold text-zinc-900">사업계획서 작성</h1>
        <p className="mt-1 text-sm text-zinc-600">
          금액은 <strong>억원</strong>, 평당가만 <strong>만원</strong> 단위로 입력합니다.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2 print:hidden">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
            onClick={() => setInput(structuredClone(preset.input))}
          >
            임시 값 {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-200/60"
          onClick={() => setInput(emptyPlanInput(crypto.randomUUID()))}
        >
          빈 폼으로
        </button>
      </div>

      <form className="flex flex-col gap-4 print:hidden" onSubmit={(e) => e.preventDefault()}>
        <Section title="사업 개요">
          <div className="grid grid-cols-1 gap-3">
            <TextField
              label="사업명"
              value={input.projectName}
              onChange={(projectName) => setInput((prev) => ({ ...prev, projectName }))}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <SelectField
                label="사업대상지 · 시도"
                value={input.sido}
                options={SIDO_NAMES}
                onChange={(sido) => setInput((prev) => ({ ...prev, sido }))}
              />
              <TextField
                label="사업대상지 · 시군구 (전체 이름)"
                value={input.sigungu}
                placeholder="예: 수원시 영통구"
                onChange={(sigungu) => setInput((prev) => ({ ...prev, sigungu }))}
              />
            </div>
          </div>
        </Section>

        <Section title="주택형">
          <div
            aria-hidden
            className="hidden gap-2 px-1 pb-1 text-xs font-medium text-zinc-500 sm:grid sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_3rem]"
          >
            <span>이름</span>
            <span className="text-right">전용(㎡)</span>
            <span className="text-right">공급(평)</span>
            <span className="text-right">세대수</span>
            <span />
          </div>

          <div className="flex flex-col gap-3 sm:gap-2">
            {input.unitTypes.map((row, index) => (
              <div
                key={row.id}
                className="grid grid-cols-2 items-end gap-2 rounded-md border border-zinc-200 p-2 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_3rem] sm:border-0 sm:p-0"
              >
                <div className="col-span-2 sm:col-span-1">
                  <TextField
                    label={`주택형 ${index + 1} 이름`}
                    hideLabelOnWide
                    value={row.name}
                    placeholder="예: 84㎡"
                    onChange={(name) => updateRow(row.id, { name })}
                  />
                </div>
                {(
                  [
                    ["exclusiveM2", "전용(㎡)"],
                    ["supplyPyeong", "공급(평)"],
                    ["households", "세대수"],
                  ] as [UnitTypeNumericKey, string][]
                ).map(([key, label]) => (
                  <NumberField
                    key={key}
                    label={label}
                    hideLabelOnWide
                    value={row[key]}
                    onChange={(value) => updateRow(row.id, { [key]: value })}
                  />
                ))}
                <button
                  type="button"
                  aria-label={`주택형 ${index + 1} 삭제`}
                  className="h-[34px] rounded-md border border-zinc-300 text-xs text-zinc-600 hover:border-red-300 hover:text-red-600"
                  onClick={() =>
                    setInput((prev) => ({
                      ...prev,
                      unitTypes: prev.unitTypes.filter((r) => r.id !== row.id),
                    }))
                  }
                >
                  삭제
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="mt-3 w-full rounded-md border border-dashed border-zinc-400 py-2 text-sm text-zinc-600 hover:border-zinc-600 hover:text-zinc-900 print:hidden"
            onClick={() =>
              setInput((prev) => ({
                ...prev,
                unitTypes: [...prev.unitTypes, emptyUnitType(crypto.randomUUID())],
              }))
            }
          >
            + 주택형 추가
          </button>

          <dl className="mt-4 grid grid-cols-1 gap-2 border-t border-zinc-200 pt-3 sm:grid-cols-2">
            <Derived
              label="공급면적 합계"
              value={supplyTotal === null ? null : `${oneDecimalFormat.format(supplyTotal)}평`}
              formula="Σ(공급평 × 세대수)"
              negative={supplyTotal !== null && supplyTotal < 0}
            />
            <Derived
              label="세대수 합계"
              value={householdTotal === null ? null : `${numberFormat.format(householdTotal)}세대`}
              formula="Σ세대수"
              negative={householdTotal !== null && householdTotal < 0}
            />
          </dl>
        </Section>

        <Section title="분양 · 유입">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberField
              label="평당가 (공급기준)"
              unit="만원"
              value={input.pricePerPyeong}
              onChange={(v) => setNumber("pricePerPyeong", v)}
            />
            <NumberField
              label="상가"
              unit="억원"
              value={input.retail}
              onChange={(v) => setNumber("retail", v)}
            />
            <NumberField
              label="기타유입"
              unit="억원"
              value={input.otherInflow}
              onChange={(v) => setNumber("otherInflow", v)}
            />
          </div>
        </Section>

        <Section title="비용 · 조달">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberField
              label="고정비"
              unit="억원"
              value={input.fixedCost}
              onChange={(v) => setNumber("fixedCost", v)}
            />
            <NumberField
              label="후순위"
              unit="억원"
              value={input.subordinated}
              onChange={(v) => setNumber("subordinated", v)}
            />
            <NumberField
              label="본PF"
              unit="억원"
              value={input.seniorPf}
              onChange={(v) => setNumber("seniorPf", v)}
            />
            <NumberField
              label="본PF 금융비용"
              unit="억원"
              value={input.seniorPfFinanceCost}
              onChange={(v) => setNumber("seniorPfFinanceCost", v)}
            />
          </div>
        </Section>
      </form>

      <div className="mt-6 flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          disabled={area === ""}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          onClick={() => void market.start(area)}
        >
          사업계획서 만들기
        </button>
        {area === "" ? (
          <span className="text-xs text-zinc-500">사업대상지(시도·시군구)를 입력하면 만들 수 있습니다.</span>
        ) : (
          market.state && (
            <button
              type="button"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              onClick={() => window.print()}
            >
              인쇄 · PDF
            </button>
          )
        )}
      </div>

      {market.state && summary && (
        <article className="mt-8 flex flex-col gap-8 border-t-2 border-zinc-900 pt-6 print:mt-0 print:border-0 print:pt-0">
          <header>
            <p className="text-xs tracking-widest text-zinc-500">대주단 제출용 사업계획서</p>
            <h2 className="text-2xl font-bold text-zinc-900">{input.projectName || "(사업명 없음)"}</h2>
            <p className="text-sm text-zinc-600">{market.state.area}</p>
          </header>

          <ReportSection title="결론">
            <Conclusion plan={plan} margin={summary.margin} marketPending={summary.newSupply === null} />
          </ReportSection>

          <ReportSection title="2. 시장 분석 · 분양가 근거">
            <MarketAnalysis
              state={market.state}
              summary={summary}
              plan={plan}
              onRetry={market.retry}
              onRestart={() => void market.start(market.state!.area)}
              onPickRegion={pickRegion}
            />
          </ReportSection>

          <ReportSection title="3. 사업수지">
            <WaterfallChart steps={plan?.waterfall ?? null} repayable={plan?.repayable ?? false} />
          </ReportSection>
        </article>
      )}
    </div>
  );
}

/** 보고서 장 제목 */
function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="border-b border-zinc-300 pb-1 text-lg font-bold text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}

/** 결론: 핵심 지표(수식 포함)와 시장 대비 여유 */
function Conclusion({
  plan,
  margin,
  marketPending,
}: {
  plan: PlanResult | null;
  margin: MarketMargin | null;
  marketPending: boolean;
}) {
  if (plan === null) {
    return (
      <p className="rounded-md bg-zinc-50 px-3 py-4 text-sm text-zinc-500">자료 없음 — 입력값을 모두 채우세요.</p>
    );
  }
  const rateText = (rate: number | null) =>
    rate === null ? "분양률 100%로도 미달" : `분양률 ${formatRatioPct(rate)}`;
  const priceText = (price: number | null) => (price === null ? "산정 불가" : `평당 ${formatManwon(price)}`);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Indicator
          label="기말현금 (분양률 100%)"
          value={formatEokSigned(plan.endingCash)}
          negative={plan.endingCash < 0}
          formula="분양수입 × 0.992 − 세대수 × 0.03 + 기타유입 − 고정비"
        />
        <Indicator
          label="만기 누적 DSCR"
          value={plan.dscr === null ? "자료 없음" : formatNumber(plan.dscr, 2)}
          negative={plan.dscr !== null && plan.dscr < 1}
          formula="1 + (기말현금 + 후순위) ÷ (본PF + 본PF 금융비용)"
        />
        <Indicator
          label="LTV"
          value={plan.ltv === null ? "자료 없음" : formatRatioPct(plan.ltv)}
          formula="본PF ÷ 분양수입(분양률 100%)"
        />
        <Indicator
          label="본PF 상환"
          value={plan.repayable ? "상환 가능" : "상환 불가"}
          negative={!plan.repayable}
          formula="기말현금 ≥ −후순위"
        />
        <Indicator
          label="기말현금 0 한계"
          value={`${rateText(plan.zeroCashLimit.salesRate)} · ${priceText(plan.zeroCashLimit.price)}`}
          formula="기말현금 = 0 (이분법)"
        />
        <Indicator
          label="상환 한계"
          value={`${rateText(plan.repaymentLimit.salesRate)} · ${priceText(plan.repaymentLimit.price)}`}
          formula="기말현금 = −후순위 (이분법)"
        />
      </dl>
      <div className="rounded-md border border-zinc-200 px-3 py-2">
        <p className="text-xs text-zinc-600">시장 대비 여유</p>
        {margin ? (
          <>
            <p
              className={`text-2xl font-bold tabular-nums ${margin.marginPct < 0 ? "text-red-600" : "text-zinc-900"}`}
            >
              {formatPct(margin.marginPct)}
            </p>
            <p className="mt-1 text-xs tabular-nums text-zinc-700">
              인근 신규 84㎡ 공급평당 중위 {formatManwon(margin.marketPrice)} vs 상환 한계 평당가{" "}
              {formatManwon(margin.repaymentLimitPrice)}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">(시장 중위 − 상환 한계) ÷ 시장 중위</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">
            {marketPending ? "시장 자료를 불러오는 중…" : "자료 없음 — 공공데이터 확인 필요"}
          </p>
        )}
      </div>
    </div>
  );
}

/** 지표 한 칸: 값 · 수식 */
function Indicator({
  label,
  value,
  formula,
  negative = false,
}: {
  label: string;
  value: string;
  formula: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2">
      <dt className="text-xs text-zinc-600">{label}</dt>
      <dd className={`text-base font-semibold tabular-nums ${negative ? "text-red-600" : "text-zinc-900"}`}>
        {value}
      </dd>
      <dd className="text-[11px] text-zinc-500">{formula}</dd>
    </div>
  );
}

/** 입력 구역 테두리와 제목 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-zinc-200 bg-white p-4">
      <legend className="px-1 text-sm font-semibold text-zinc-900">{title}</legend>
      {children}
    </fieldset>
  );
}

/** 입력값에서 바로 계산한 값 한 줄 (값 · 수식) */
function Derived({
  label,
  value,
  formula,
  negative,
}: {
  label: string;
  value: string | null;
  formula: string;
  negative: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-md bg-zinc-50 px-3 py-2">
      <dt className="text-xs text-zinc-600">{label}</dt>
      <dd className="text-right">
        <span
          className={`text-sm font-semibold tabular-nums ${
            value === null ? "font-normal text-zinc-400" : negative ? "text-red-600" : "text-zinc-900"
          }`}
        >
          {value ?? "자료 없음"}
        </span>
        <span className="ml-2 text-[11px] text-zinc-500">{formula}</span>
      </dd>
    </div>
  );
}

/** 라벨이 붙은 글자 입력칸 */
function TextField({
  label,
  value,
  placeholder,
  hideLabelOnWide = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  hideLabelOnWide?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={`text-xs font-medium text-zinc-600 ${hideLabelOnWide ? "sm:sr-only" : ""}`}
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** 라벨이 붙은 선택 상자 */
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-600">
        {label}
      </label>
      <select
        id={id}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">선택</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * 숫자 입력칸. 편집 중에는 입력한 문자열을 그대로 두고,
 * 포커스를 잃으면 천단위 콤마로 다시 표시한다. 비우면 null.
 */
function NumberField({
  label,
  value,
  unit,
  hideLabelOnWide = false,
  onChange,
}: {
  label: string;
  value: number | null;
  unit?: string;
  hideLabelOnWide?: boolean;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseInput(draft) === undefined;
  const negative = value !== null && value < 0;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={`text-xs font-medium text-zinc-600 ${hideLabelOnWide ? "sm:sr-only" : ""}`}
      >
        {label}
      </label>
      <div
        className={`flex items-center rounded-md border bg-white focus-within:ring-2 focus-within:ring-blue-500/40 ${
          invalid ? "border-red-400" : "border-zinc-300"
        }`}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={`w-full min-w-0 rounded-md bg-transparent px-2.5 py-1.5 text-right text-sm tabular-nums outline-none ${
            negative ? "text-red-600" : ""
          }`}
          value={draft ?? formatInput(value)}
          onFocus={() => setDraft(formatInput(value))}
          onChange={(e) => {
            setDraft(e.target.value);
            const parsed = parseInput(e.target.value);
            if (parsed !== undefined) onChange(parsed);
          }}
          onBlur={() => setDraft(null)}
          aria-invalid={invalid}
        />
        {unit && <span className="shrink-0 pr-2.5 text-xs text-zinc-500">{unit}</span>}
      </div>
    </div>
  );
}
