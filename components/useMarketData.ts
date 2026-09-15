"use client";

import { useCallback, useRef, useState } from "react";
import { our84UnitPrice, type PlanInput, type PlanResult } from "@/lib/calc";
import {
  buildJeonseTable,
  buildMarketMargin,
  buildNewSupplyTable,
  buildPremiumTable,
  buildShortfallTable,
  createTaskQueue,
  noticeKey,
  recentMonths,
  type JeonseTable,
  type MarketMargin,
  type NewSupplyTable,
  type Notice,
  type NoticeDetail,
  type PremiumTable,
  type ShortfallTable,
} from "@/lib/market";
import type { SubscriptionList } from "@/lib/server/applyhome";
import type { RegionLookup } from "@/lib/server/region";
import type { PresaleMonth, RentMonth } from "@/lib/server/rtms";

/** 동시에 부르는 API 수 */
const CONCURRENCY = 4;

export type Slot<T> =
  | { status: "loading" }
  | { status: "done"; data: T }
  | { status: "error"; error: string };

export type RegionResponse = RegionLookup & { source: string };
export type PresaleResponse = PresaleMonth & { area: string; lawdCode: string };
export type RentResponse = RentMonth & { area: string; lawdCode: string };
export type SubscriptionResponse = SubscriptionList & { area: string; lawdCode: string };
export type DetailResponse = NoticeDetail & { source: string };

export type MarketState = {
  runId: number;
  /** 조회에 쓴 사업대상지 (시도 시군구) */
  area: string;
  /** 조회를 시작한 날 (한국 시간) */
  today: string;
  months: string[];
  region: Slot<RegionResponse>;
  presale: Record<string, Slot<PresaleResponse>>;
  rent: Record<string, Slot<RentResponse>>;
  subscription: Slot<SubscriptionResponse> | null;
  details: Record<string, Slot<DetailResponse>>;
};

/** 한국 시간 기준 오늘 (YYYY-MM-DD) */
function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 앱 API를 호출해 JSON을 받는다. 실패하면 서버가 준 한국어 메시지로 오류를 던진다. */
async function getJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("서버에 연결하지 못했습니다.");
  }
  const body = (await response.json().catch(() => null)) as ({ error?: string } & T) | null;
  if (!response.ok || body === null) {
    throw new Error(body?.error ?? `요청에 실패했습니다. (HTTP ${response.status})`);
  }
  return body;
}

/** 오류 객체에서 화면에 보여줄 문장을 꺼낸다. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류";
}

/**
 * [사업계획서 만들기] 이후 시장 분석 자료를 불러온다.
 * 지역 확인 → 분양권 12개월 · 전월세 12개월 · 청약홈 목록 → 단지별 상세, 동시 4개까지.
 */
export function useMarketData() {
  const [state, setState] = useState<MarketState | null>(null);
  const runRef = useRef(0);
  const queueRef = useRef(createTaskQueue(CONCURRENCY));

  /** 같은 조회(runId)일 때만 상태를 고친다. 새 조회를 시작하면 이전 결과는 버린다. */
  const update = useCallback((runId: number, change: (prev: MarketState) => MarketState) => {
    setState((prev) => (prev && prev.runId === runId ? change(prev) : prev));
  }, []);

  /** 줄에 넣어 호출하고, 결과를 slot으로 반영한다. 실패하면 null. */
  const load = useCallback(
    async <T>(
      runId: number,
      url: string,
      apply: (prev: MarketState, slot: Slot<T>) => MarketState,
    ): Promise<T | null> => {
      update(runId, (prev) => apply(prev, { status: "loading" }));
      try {
        const data = await queueRef.current.push(() => getJson<T>(url));
        update(runId, (prev) => apply(prev, { status: "done", data }));
        return runRef.current === runId ? data : null;
      } catch (error) {
        update(runId, (prev) => apply(prev, { status: "error", error: messageOf(error) }));
        return null;
      }
    },
    [update],
  );

  /** 분양권전매 한 달치 */
  const loadPresale = useCallback(
    (runId: number, area: string, ym: string) =>
      load<PresaleResponse>(
        runId,
        `/api/market/presale?area=${encodeURIComponent(area)}&ym=${ym}`,
        (prev, slot) => ({ ...prev, presale: { ...prev.presale, [ym]: slot } }),
      ),
    [load],
  );

  /** 전월세 한 달치 */
  const loadRent = useCallback(
    (runId: number, area: string, ym: string) =>
      load<RentResponse>(
        runId,
        `/api/market/rent?area=${encodeURIComponent(area)}&ym=${ym}`,
        (prev, slot) => ({ ...prev, rent: { ...prev.rent, [ym]: slot } }),
      ),
    [load],
  );

  /** 단지 한 곳의 주택형별 분양가 · 경쟁률 */
  const loadDetail = useCallback(
    (runId: number, notice: Notice) => {
      const key = noticeKey(notice);
      return load<DetailResponse>(
        runId,
        `/api/market/subscription/detail?id=${encodeURIComponent(notice.houseManageNo)}&pblanc=${encodeURIComponent(notice.pblancNo)}`,
        (prev, slot) => ({ ...prev, details: { ...prev.details, [key]: slot } }),
      );
    },
    [load],
  );

  /** 청약홈 공고 목록을 받은 뒤 단지별 상세를 줄에 넣는다 */
  const loadSubscription = useCallback(
    async (runId: number, area: string) => {
      const list = await load<SubscriptionResponse>(
        runId,
        `/api/market/subscription?area=${encodeURIComponent(area)}`,
        (prev, slot) => ({ ...prev, subscription: slot }),
      );
      list?.notices.forEach((notice) => void loadDetail(runId, notice));
    },
    [load, loadDetail],
  );

  /** 새 조회를 시작한다 */
  const start = useCallback(
    async (area: string) => {
      const runId = ++runRef.current;
      queueRef.current = createTaskQueue(CONCURRENCY);
      const today = todayKst();
      const months = recentMonths(today, 12);
      setState({
        runId,
        area,
        today,
        months,
        region: { status: "loading" },
        presale: {},
        rent: {},
        subscription: null,
        details: {},
      });

      const region = await load<RegionResponse>(
        runId,
        `/api/region?q=${encodeURIComponent(area)}`,
        (prev, slot) => ({ ...prev, region: slot }),
      );
      if (!region?.matched) return;

      void loadSubscription(runId, area);
      for (const ym of months) {
        void loadPresale(runId, area, ym);
        void loadRent(runId, area, ym);
      }
    },
    [load, loadPresale, loadRent, loadSubscription],
  );

  /** 실패한 항목 다시 시도 */
  const retry = useCallback(
    (kind: "presale" | "rent" | "subscription" | "detail", key?: string) => {
      if (!state) return;
      const { runId, area } = state;
      if (kind === "presale" && key) void loadPresale(runId, area, key);
      if (kind === "rent" && key) void loadRent(runId, area, key);
      if (kind === "subscription") void loadSubscription(runId, area);
      if (kind === "detail" && key && state.subscription?.status === "done") {
        const notice = state.subscription.data.notices.find((n) => noticeKey(n) === key);
        if (notice) void loadDetail(runId, notice);
      }
    },
    [state, loadPresale, loadRent, loadSubscription, loadDetail],
  );

  return { state, start, retry };
}

// ─────────────────────────────────────────────────────────────
// 불러온 자료 요약 — 표는 lib/market 함수로만 만든다
// ─────────────────────────────────────────────────────────────

export type Progress = {
  done: number;
  total: number;
  /** 실패한 항목 키와 오류 */
  failed: { key: string; error: string }[];
  /** 모두 끝났고 실패가 없음 */
  complete: boolean;
};

export type MarketSummary = {
  presale: Progress;
  rent: Progress;
  /** 청약홈 목록을 받기 전이면 null */
  details: Progress | null;
  newSupply: NewSupplyTable | null;
  premium: PremiumTable | null;
  shortfall: ShortfallTable | null;
  jeonse: JeonseTable | null;
  margin: MarketMargin | null;
  presaleMeta: SlotMeta;
  rentMeta: SlotMeta;
  subscriptionMeta: SlotMeta;
};

export type SlotMeta = {
  fetchedAt: string;
  rawCount: number;
  excluded: { reason: string; count: number }[];
};

/** 여러 slot의 진행 상황을 센다 */
function progressOf<T>(keys: string[], slots: Record<string, Slot<T>>): Progress {
  const failed: Progress["failed"] = [];
  let done = 0;
  for (const key of keys) {
    const slot = slots[key];
    if (slot?.status === "done") done++;
    if (slot?.status === "error") failed.push({ key, error: slot.error });
  }
  return { done, total: keys.length, failed, complete: done === keys.length };
}

/** 조회일 목록을 "2026-09-15" 또는 "2026-09-14 ~ 2026-09-15"로 */
function dateRange(dates: string[]): string {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return "-";
  return unique.length === 1 ? unique[0] : `${unique[0]} ~ ${unique[unique.length - 1]}`;
}

/** 월별 제외 건수를 이유별로 합친다 */
function mergeExcluded(lists: { reason: string; count: number }[][]): { reason: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const list of lists) {
    for (const { reason, count } of list) totals.set(reason, (totals.get(reason) ?? 0) + count);
  }
  return [...totals].map(([reason, count]) => ({ reason, count }));
}

/** 완료된 slot의 data만 모은다 */
function doneData<T>(keys: string[], slots: Record<string, Slot<T>>): T[] {
  return keys.flatMap((key) => {
    const slot = slots[key];
    return slot?.status === "done" ? [slot.data] : [];
  });
}

/** 상태와 입력값으로 네 표와 시장 대비 여유를 만든다. 자료가 다 모이지 않은 표는 null. */
export function summarizeMarket(
  state: MarketState,
  input: PlanInput,
  plan: PlanResult | null,
): MarketSummary {
  const presale = progressOf(state.months, state.presale);
  const rent = progressOf(state.months, state.rent);
  const list = state.subscription?.status === "done" ? state.subscription.data : null;
  const noticeKeys = list ? list.notices.map(noticeKey) : [];
  const details = list ? progressOf(noticeKeys, state.details) : null;

  const detailMap: Record<string, NoticeDetail> = {};
  for (const key of noticeKeys) {
    const slot = state.details[key];
    if (slot?.status === "done") detailMap[key] = slot.data;
  }

  const presaleMonths = doneData(state.months, state.presale);
  const rentMonths = doneData(state.months, state.rent);
  const subscriptionReady = list !== null && details !== null && details.complete;

  const newSupply = subscriptionReady
    ? buildNewSupplyTable(list.notices, detailMap, input.pricePerPyeong)
    : null;
  const premium =
    subscriptionReady && presale.complete
      ? buildPremiumTable(
          presaleMonths.flatMap((m) => m.deals),
          list.notices,
          detailMap,
        )
      : null;
  const shortfall = subscriptionReady
    ? buildShortfallTable(list.notices, detailMap, list.remainders)
    : null;
  const jeonse = rent.complete
    ? buildJeonseTable(
        rentMonths.flatMap((m) => m.deals),
        our84UnitPrice(input),
        state.today,
      )
    : null;

  return {
    presale,
    rent,
    details,
    newSupply,
    premium,
    shortfall,
    jeonse,
    margin: buildMarketMargin(plan?.repaymentLimit.price ?? null, newSupply?.median ?? null),
    presaleMeta: {
      fetchedAt: dateRange(presaleMonths.map((m) => m.fetchedAt)),
      rawCount: presaleMonths.reduce((a, m) => a + m.rawCount, 0),
      excluded: mergeExcluded(presaleMonths.map((m) => m.excluded)),
    },
    rentMeta: {
      fetchedAt: dateRange(rentMonths.map((m) => m.fetchedAt)),
      rawCount: rentMonths.reduce((a, m) => a + m.rawCount, 0),
      excluded: mergeExcluded(rentMonths.map((m) => m.excluded)),
    },
    subscriptionMeta: {
      fetchedAt: dateRange([
        ...(list ? [list.fetchedAt] : []),
        ...Object.values(detailMap).map((d) => d.fetchedAt),
      ]),
      rawCount: list?.rawCount ?? 0,
      excluded: list?.excluded ?? [],
    },
  };
}
