/**
 * 화면 표시용 숫자 포맷. 계산에는 쓰지 않는다.
 */

const cache = new Map<number, Intl.NumberFormat>();

/** 소수 digits자리 고정, 천단위 콤마 */
export function formatNumber(value: number, digits = 0): string {
  let format = cache.get(digits);
  if (!format) {
    format = new Intl.NumberFormat("ko-KR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    cache.set(digits, format);
  }
  // -0.0 표시 방지
  const rounded = Number(value.toFixed(digits));
  return format.format(rounded === 0 ? 0 : rounded);
}

/** 억원: +380.3억 처럼 부호를 붙인다 */
export function formatEokSigned(value: number, digits = 1): string {
  const text = formatNumber(value, digits);
  return `${value > 0 && Number(value.toFixed(digits)) !== 0 ? "+" : ""}${text}억`;
}

/** 퍼센트: 비율(0.602) → "60.2%" */
export function formatRatioPct(ratio: number, digits = 1): string {
  return `${formatNumber(ratio * 100, digits)}%`;
}

/** 이미 퍼센트인 값 → "19.4%" */
export function formatPct(value: number, digits = 1): string {
  return `${formatNumber(value, digits)}%`;
}

/** 만원 금액 → "2,183만원" */
export function formatManwon(value: number, digits = 0): string {
  return `${formatNumber(value, digits)}만원`;
}

/** YYYYMM → "2026.08" */
export function formatYm(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}
