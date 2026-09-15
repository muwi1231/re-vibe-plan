"use client";

import type { ReactNode } from "react";
import type { PlanResult } from "@/lib/calc";
import { SOURCE } from "@/lib/market";
import { formatManwon, formatNumber, formatPct, formatYm } from "@/lib/format";
import { MarketMarginChart } from "./charts/MarketMarginChart";
import type { MarketState, MarketSummary, Progress } from "./useMarketData";

type Props = {
  state: MarketState;
  summary: MarketSummary;
  plan: PlanResult | null;
  onRetry: (kind: "presale" | "rent" | "subscription" | "detail", key?: string) => void;
  onRestart: () => void;
  /** 지역 후보를 고르면 입력값의 시도·시군구를 바꾸고 다시 조회 */
  onPickRegion: (name: string) => void;
};

/** 2장 시장 분석 · 분양가 근거 */
export function MarketAnalysis({ state, summary, plan, onRetry, onRestart, onPickRegion }: Props) {
  const { region } = state;

  if (region.status === "loading") {
    return <Notice>사업대상지 &lsquo;{state.area}&rsquo;의 법정동코드를 확인하는 중…</Notice>;
  }
  if (region.status === "error") {
    return (
      <Notice tone="error">
        <p className="font-semibold">자료 없음 — 공공데이터 확인 필요</p>
        <p className="mt-1">{region.error}</p>
        <RetryButton onClick={onRestart} />
      </Notice>
    );
  }
  if (!region.data.matched) {
    return (
      <Notice tone="error">
        <p className="font-semibold">법정동코드에서 &lsquo;{region.data.area}&rsquo;를 찾지 못했습니다.</p>
        {region.data.candidates.length > 0 ? (
          <>
            <p className="mt-1">아래 후보 중 사업대상지를 고르세요.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {region.data.candidates.map((c) => (
                <button
                  key={c.code + c.name}
                  type="button"
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-50"
                  onClick={() => onPickRegion(c.name)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1">시도·시군구 이름을 확인하세요.</p>
        )}
      </Notice>
    );
  }

  const matched = region.data.matched;
  const period = `${formatYm(state.months[0])} ~ ${formatYm(state.months[state.months.length - 1])}`;
  const subscription = state.subscription;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
        <p>
          사업대상지 <strong>{region.data.area}</strong>{region.data.area !== matched.name && <> → 시군구 <strong>{matched.name}</strong></>} (법정동코드 {matched.code}) · 실거래 기간 {period}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 tabular-nums print:hidden">
          <ProgressText label="분양권" progress={summary.presale} unit="개월" />
          <ProgressText label="전월세" progress={summary.rent} unit="개월" />
          {summary.details ? (
            <ProgressText label="청약홈" progress={summary.details} unit="곳" />
          ) : (
            <span>
              청약홈{" "}
              {subscription?.status === "error" ? (
                <span className="text-red-600">목록 실패</span>
              ) : (
                "목록 확인 중…"
              )}
            </span>
          )}
        </p>
      </div>

      <FailureList summary={summary} state={state} onRetry={onRetry} />

      <TableCard
        title="① 인근 신규 84㎡ 공급평당가 vs 계획가"
        ready={summary.newSupply !== null}
        area={matched.name}
        count={summary.newSupply ? `주택형 ${formatNumber(summary.newSupply.rows.length)}개` : ""}
        excluded={[...summary.subscriptionMeta.excluded, ...(summary.newSupply?.excluded ?? [])]}
        fetchedAt={summary.subscriptionMeta.fetchedAt}
        source={SOURCE.applyhomeInfo}
      >
        {summary.newSupply && (
          <>
            <MarketMarginChart
              rows={summary.newSupply.rows}
              planPrice={summary.newSupply.planPrice}
              repaymentLimitPrice={plan?.repaymentLimit.price ?? null}
              margin={summary.margin}
              area={matched.name}
              fetchedAt={summary.subscriptionMeta.fetchedAt}
              source={SOURCE.applyhomeInfo}
            />
            <Metrics
              items={[
                {
                  label: "공급평당가 중위값",
                  value: summary.newSupply.median === null ? null : formatManwon(summary.newSupply.median),
                  formula: "공급금액(최고) ÷ (공급면적 × 0.3025)의 중위값",
                },
                {
                  label: "최저 ~ 최고",
                  value:
                    summary.newSupply.min === null
                      ? null
                      : `${formatNumber(summary.newSupply.min)} ~ ${formatNumber(summary.newSupply.max!)}만원`,
                  formula: "84㎡형 주택형 기준",
                },
                {
                  label: "계획가 대비 중위값",
                  value:
                    summary.newSupply.planVsMedianPct === null
                      ? null
                      : formatPct(summary.newSupply.planVsMedianPct),
                  negative: (summary.newSupply.planVsMedianPct ?? 0) < 0,
                  formula: "(계획가 − 중위값) ÷ 중위값",
                },
              ]}
            />
          </>
        )}
      </TableCard>

      <TableCard
        title="② 분양권 웃돈 (입주권 제외)"
        ready={summary.premium !== null}
        area={matched.name}
        count={
          summary.premium
            ? `거래 ${formatNumber(summary.premium.rows.length)}건 (원자료 ${formatNumber(summary.presaleMeta.rawCount)}건)`
            : ""
        }
        excluded={[...summary.presaleMeta.excluded, ...(summary.premium?.excluded ?? [])]}
        fetchedAt={summary.presaleMeta.fetchedAt}
        source={`${SOURCE.presale} · ${SOURCE.applyhomeInfo}`}
      >
        {summary.premium && (
          <>
            <Metrics
              items={[
                {
                  label: "웃돈 중위값",
                  value: summary.premium.median === null ? null : formatManwon(summary.premium.median),
                  negative: (summary.premium.median ?? 0) < 0,
                  formula: "거래금액 − 청약홈 공급금액(최고)",
                },
                {
                  label: "웃돈 0 이하 거래",
                  value: `${formatNumber(summary.premium.nonPositive)}건`,
                  formula: "웃돈 ≤ 0",
                },
              ]}
            />
            <RowsTable
              headers={["단지", "계약월", "전용㎡", "거래금액", "공급금액", "웃돈"]}
              rows={summary.premium.rows.map((r) => [
                r.aptNm,
                formatYm(r.ym),
                formatNumber(r.exclusiveM2, 2),
                formatNumber(r.dealAmount),
                formatNumber(r.supplyPrice),
                <Signed key="p" value={r.premium} />,
              ])}
            />
          </>
        )}
      </TableCard>

      <TableCard
        title="③ 1·2순위 미달 · 잔여세대"
        ready={summary.shortfall !== null}
        area={matched.name}
        count={
          summary.shortfall
            ? `주택형 ${formatNumber(summary.shortfall.rows.length)}개 · 잔여세대 공고 ${formatNumber(summary.shortfall.remainders.length)}건`
            : ""
        }
        excluded={[...summary.subscriptionMeta.excluded, ...(summary.shortfall?.excluded ?? [])]}
        fetchedAt={summary.subscriptionMeta.fetchedAt}
        source={`${SOURCE.applyhomeInfo} · ${SOURCE.applyhomeCompetition}`}
      >
        {summary.shortfall && (
          <>
            <Metrics
              items={[
                {
                  label: "1순위 미달 주택형",
                  value: `${formatNumber(summary.shortfall.shortAfterRank1)} / ${formatNumber(summary.shortfall.rows.length)}`,
                  formula: "1순위 접수건수 < 공급세대수",
                },
                {
                  label: "2순위까지 미달 주택형",
                  value: `${formatNumber(summary.shortfall.shortAfterRank2)} / ${formatNumber(summary.shortfall.rows.length)}`,
                  formula: "1순위 + 2순위 접수건수 < 공급세대수",
                },
                {
                  label: "잔여세대 공급규모 합계",
                  value: `${formatNumber(summary.shortfall.remainderHouseholds)}세대`,
                  formula: "잔여세대 공고 공급규모 합",
                },
              ]}
            />
            <RowsTable
              headers={["단지", "주택형", "공급", "1순위", "2순위", "결과"]}
              rows={summary.shortfall.rows.map((r) => [
                r.houseNm,
                r.houseTy,
                formatNumber(r.supply),
                formatNumber(r.rank1Requests),
                formatNumber(r.rank2Requests),
                r.shortAfterRank2 ? (
                  <span key="s" className="text-red-600">2순위 미달</span>
                ) : r.shortAfterRank1 ? (
                  <span key="s" className="text-red-600">1순위 미달</span>
                ) : (
                  "마감"
                ),
              ])}
            />
            <RowsTable
              caption="잔여세대 공고"
              headers={["단지", "모집공고일", "공급규모"]}
              rows={summary.shortfall.remainders.map((n) => [
                n.houseNm,
                n.recruitDate,
                n.totalSupply === null ? "-" : formatNumber(n.totalSupply),
              ])}
            />
          </>
        )}
      </TableCard>

      <TableCard
        title="④ 84㎡ 신규 전세 ÷ 우리 84㎡ 세대당 분양가"
        ready={summary.jeonse !== null}
        area={matched.name}
        count={
          summary.jeonse
            ? `전세 ${formatNumber(summary.jeonse.rows.length)}건 (원자료 ${formatNumber(summary.rentMeta.rawCount)}건)`
            : ""
        }
        excluded={[...summary.rentMeta.excluded, ...(summary.jeonse?.excluded ?? [])]}
        fetchedAt={summary.rentMeta.fetchedAt}
        source={SOURCE.rent}
      >
        {summary.jeonse && (
          <Metrics
            items={[
              {
                label: "84㎡ 신규 전세 중위값",
                value: summary.jeonse.medianDeposit === null ? null : formatManwon(summary.jeonse.medianDeposit),
                formula: "전세(월세 0) · 전용 80~85㎡ · 건축 5년 이내 보증금 중위값",
              },
              {
                label: "우리 84㎡ 세대당 분양가",
                value: summary.jeonse.our84Price === null ? null : formatManwon(summary.jeonse.our84Price),
                formula: "84㎡형 공급평(세대수 가중) × 계획 평당가",
              },
              {
                label: "전세 ÷ 분양가",
                value: summary.jeonse.ratioPct === null ? null : formatPct(summary.jeonse.ratioPct),
                formula: "중위 전세보증금 ÷ 우리 84㎡ 세대당 분양가",
              },
            ]}
          />
        )}
      </TableCard>
    </div>
  );
}

/** 진행 표시: "분양권 7/12개월" */
function ProgressText({ label, progress, unit }: { label: string; progress: Progress; unit: string }) {
  return (
    <span>
      {label} {formatNumber(progress.done)}/{formatNumber(progress.total)}
      {unit}
      {progress.failed.length > 0 && (
        <span className="text-red-600"> (실패 {progress.failed.length})</span>
      )}
    </span>
  );
}

/** 실패한 호출 목록과 [다시 시도] */
function FailureList({
  summary,
  state,
  onRetry,
}: {
  summary: MarketSummary;
  state: MarketState;
  onRetry: Props["onRetry"];
}) {
  const items: { label: string; error: string; retry: () => void }[] = [
    ...summary.presale.failed.map((f) => ({
      label: `분양권 ${formatYm(f.key)}`,
      error: f.error,
      retry: () => onRetry("presale", f.key),
    })),
    ...summary.rent.failed.map((f) => ({
      label: `전월세 ${formatYm(f.key)}`,
      error: f.error,
      retry: () => onRetry("rent", f.key),
    })),
    ...(state.subscription?.status === "error"
      ? [{ label: "청약홈 공고 목록", error: state.subscription.error, retry: () => onRetry("subscription") }]
      : []),
    ...(summary.details?.failed ?? []).map((f) => {
      const notice =
        state.subscription?.status === "done"
          ? state.subscription.data.notices.find((n) => `${n.houseManageNo}-${n.pblancNo}` === f.key)
          : undefined;
      return {
        label: `청약홈 ${notice?.houseNm ?? f.key}`,
        error: f.error,
        retry: () => onRetry("detail", f.key),
      };
    }),
  ];
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800 print:hidden">
      {items.map((item) => (
        <li key={item.label} className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>{item.label}</strong> — {item.error}
          </span>
          <RetryButton onClick={item.retry} />
        </li>
      ))}
    </ul>
  );
}

/** 표 한 장 — 제목, 본문, 아래 지역·건수·제외 기준·조회일·출처 */
function TableCard({
  title,
  ready,
  area,
  count,
  excluded,
  fetchedAt,
  source,
  children,
}: {
  title: string;
  ready: boolean;
  area: string;
  count: string;
  excluded: { reason: string; count: number }[];
  fetchedAt: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <section className="break-inside-avoid rounded-lg border border-zinc-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-zinc-900">{title}</h3>
      {ready ? (
        <>
          <div className="flex flex-col gap-3">{children}</div>
          <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 border-t border-zinc-100 pt-2 text-xs text-zinc-600 sm:grid-cols-2">
            <MetaItem label="지역" value={area} />
            <MetaItem label="건수" value={count} />
            <MetaItem
              label="제외 기준"
              value={excluded.map((e) => `${e.reason} ${formatNumber(e.count)}건`).join(" · ") || "없음"}
            />
            <MetaItem label="조회일" value={fetchedAt} />
            <MetaItem label="출처" value={source} />
          </dl>
        </>
      ) : (
        <p className="text-sm text-zinc-500">불러오는 중이거나 실패한 항목이 있습니다. 모두 받으면 표시합니다.</p>
      )}
    </section>
  );
}

/** 표 아래 메타 한 줄 */
function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-medium">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** 지표 목록 — 값 옆에 수식 */
function Metrics({
  items,
}: {
  items: { label: string; value: string | null; formula: string; negative?: boolean }[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-md bg-zinc-50 px-3 py-2">
          <dt className="text-xs text-zinc-600">{item.label}</dt>
          <dd
            className={`text-base font-semibold tabular-nums ${
              item.value === null ? "font-normal text-zinc-400" : item.negative ? "text-red-600" : "text-zinc-900"
            }`}
          >
            {item.value ?? "자료 없음"}
          </dd>
          <dd className="text-[11px] text-zinc-500">{item.formula}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 상세 행 표 — 접었다 펼 수 있게 */
function RowsTable({
  caption,
  headers,
  rows,
}: {
  caption?: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <details className="rounded-md border border-zinc-100">
      <summary className="cursor-pointer px-3 py-1.5 text-xs text-zinc-600">
        {caption ?? "상세 행"} {formatNumber(rows.length)}개 보기
      </summary>
      {rows.length === 0 ? (
        <p className="px-3 py-2 text-sm text-zinc-500">자료 없음</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-300 text-zinc-600">
                {headers.map((h, i) => (
                  <th key={h} className={`px-2 py-1 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-zinc-100">
                  {row.map((cell, j) => (
                    <td key={j} className={`px-2 py-1 ${j === 0 ? "text-left" : "text-right"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

/** 음수는 빨간색으로 */
function Signed({ value }: { value: number }) {
  return <span className={value < 0 ? "text-red-600" : ""}>{formatNumber(value)}</span>;
}

/** 안내 상자 */
function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-zinc-200 bg-zinc-50 text-zinc-700"
      }`}
    >
      {children}
    </div>
  );
}

/** [다시 시도] 버튼 */
function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="mt-1 rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 hover:bg-red-100 print:hidden"
      onClick={onClick}
    >
      다시 시도
    </button>
  );
}
