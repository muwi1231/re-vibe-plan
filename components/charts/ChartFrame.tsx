"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  title: string;
  unit: string;
  /** 건수 문구 (예: "주택형 12개") */
  count: string;
  /** 조회일 문구 */
  fetchedAt: string;
  source: string;
  /** 표시할 자료가 없으면 빈 축 대신 "자료 없음" */
  empty: boolean;
  /** 차트 본문: 측정한 가로 폭(px)을 받아 SVG를 그린다 */
  chart: (width: number) => ReactNode;
  /** [표로 보기]에서 보여줄 표 */
  table: ReactNode;
};

/** 모든 차트의 공통 틀 — 가로 폭 측정, 표로 보기 토글, 아래 캡션 */
export function ChartFrame({ title, unit, count, fetchedAt, source, empty, chart, table }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0].contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <figure className="break-inside-avoid rounded-lg border border-zinc-200 bg-white p-3">
      {!empty && (
        <div className="mb-2 flex justify-end print:hidden">
          <button
            type="button"
            className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50"
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? "차트로 보기" : "표로 보기"}
          </button>
        </div>
      )}

      <div ref={containerRef} className="w-full">
        {empty ? (
          <p className="flex h-32 items-center justify-center rounded bg-zinc-50 text-sm text-zinc-500">
            자료 없음
          </p>
        ) : showTable ? (
          <div className="overflow-x-auto">{table}</div>
        ) : (
          width > 0 && chart(width)
        )}
      </div>

      <figcaption className="mt-2 border-t border-zinc-100 pt-2 text-xs text-zinc-600">
        <p className="font-semibold text-zinc-800">{title}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>단위: {unit}</span>
          <span>건수: {count}</span>
          <span>조회일: {fetchedAt}</span>
          <span>출처: {source}</span>
        </p>
      </figcaption>
    </figure>
  );
}
