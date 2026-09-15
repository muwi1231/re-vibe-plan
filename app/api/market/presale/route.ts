import type { NextRequest } from "next/server";
import { errorResponse, PublicDataError } from "@/lib/server/datago";
import { requireRegion } from "@/lib/server/region";
import { fetchPresaleMonth } from "@/lib/server/rtms";

/** GET /api/market/presale?area=&ym=YYYYMM — 분양권전매 한 달치 (해제 제외) */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ym = params.get("ym") ?? "";
  try {
    if (!/^\d{6}$/.test(ym)) throw new PublicDataError("ym은 YYYYMM 형식이어야 합니다.", 400);
    const { area, region } = await requireRegion(params.get("area") ?? "");
    const month = await fetchPresaleMonth(region.code, ym);
    return Response.json({ area, lawdCode: region.code, ...month });
  } catch (error) {
    return errorResponse(error);
  }
}
