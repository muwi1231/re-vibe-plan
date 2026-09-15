import "server-only";

/**
 * 공공데이터 API 호출 공통부. 서버에서만 import 된다.
 * 인증키(DATA_GO_KR_KEY)는 여기서만 읽고, 값·요청 URL을 응답이나 로그에 남기지 않는다.
 */

/** 하루 캐시(초) */
export const CACHE_ONE_DAY = 60 * 60 * 24;
/** 법정동코드 캐시(초) — 30일 */
export const CACHE_30_DAYS = CACHE_ONE_DAY * 30;

/** 사용자에게 보여줄 수 있는 메시지와 HTTP 상태를 가진 오류 */
export class PublicDataError extends Error {
  status: number;

  /** message는 화면에 그대로 보여도 되는 문장만 넣는다. */
  constructor(message: string, status = 502) {
    super(message);
    this.name = "PublicDataError";
    this.status = status;
  }
}

/** 환경변수의 인증키를 URL에 넣을 수 있는 형태로 돌려준다. 없으면 503. */
function encodedServiceKey(): string {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) {
    throw new PublicDataError("서버에 DATA_GO_KR_KEY가 설정되지 않았습니다.", 503);
  }
  // 포털의 "Encoding" 키(% 포함)는 그대로, "Decoding" 키는 인코딩해서 쓴다.
  return key.includes("%") ? key : encodeURIComponent(key);
}

/** 한국 시간 기준 오늘 날짜 (YYYY-MM-DD) */
export function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * 공공데이터 API를 호출해 본문을 문자열로 받는다.
 * 캐시는 호출하는 쪽의 unstable_cache가 맡는다 (실패 응답이 캐시되지 않도록 여기서는 no-store).
 */
export async function requestPublicData(
  endpoint: string,
  params: [string, string][],
  keyParamName: "serviceKey" | "ServiceKey",
): Promise<string> {
  const query = params.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  query.push(`${keyParamName}=${encodedServiceKey()}`);

  let response: Response;
  try {
    response = await fetch(`${endpoint}?${query.join("&")}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new PublicDataError("공공데이터 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new PublicDataError("인증키가 유효하지 않거나 이 API의 활용신청이 승인되지 않았습니다.");
  }
  if (!response.ok) {
    throw new PublicDataError(`공공데이터 서버가 오류를 돌려주었습니다. (HTTP ${response.status})`);
  }
  return response.text();
}

/** 라우트 핸들러에서 쓰는 오류 응답. 알 수 없는 오류는 내용을 숨긴다. */
export function errorResponse(error: unknown): Response {
  if (error instanceof PublicDataError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "서버에서 알 수 없는 오류가 발생했습니다." }, { status: 500 });
}
