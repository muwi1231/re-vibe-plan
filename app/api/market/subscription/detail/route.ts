import type { NextRequest } from "next/server";
import { SOURCE } from "@/lib/market";
import { fetchNoticeDetail } from "@/lib/server/applyhome";
import { errorResponse, PublicDataError } from "@/lib/server/datago";

/** GET /api/market/subscription/detail?id=주택관리번호&pblanc=공고번호 — 주택형별 분양가 · 경쟁률 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id") ?? "";
  const pblanc = params.get("pblanc") ?? "";
  try {
    if (!/^\d{1,40}$/.test(id) || !/^\d{1,40}$/.test(pblanc)) {
      throw new PublicDataError("id와 pblanc는 숫자여야 합니다.", 400);
    }
    const detail = await fetchNoticeDetail(id, pblanc);
    return Response.json({
      ...detail,
      source: `${SOURCE.applyhomeInfo} · ${SOURCE.applyhomeCompetition}`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
