import type { NextRequest } from "next/server";
import { fetchSubscriptionList } from "@/lib/server/applyhome";
import { errorResponse, todayKst } from "@/lib/server/datago";
import { requireRegion } from "@/lib/server/region";

/** GET /api/market/subscription?area= — 공급위치 LIKE 시군구 · 최근 3년 APT 분양·잔여세대 공고 */
export async function GET(request: NextRequest) {
  try {
    const { area, sido, sigungu, region } = await requireRegion(
      request.nextUrl.searchParams.get("area") ?? "",
    );
    const list = await fetchSubscriptionList(sido, sigungu, todayKst());
    return Response.json({ area, lawdCode: region.code, ...list });
  } catch (error) {
    return errorResponse(error);
  }
}
