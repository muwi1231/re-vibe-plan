import type { NextRequest } from "next/server";
import { SOURCE } from "@/lib/market";
import { errorResponse } from "@/lib/server/datago";
import { lookupRegion } from "@/lib/server/region";

/** GET /api/region?q=시도 시군구 — 법정동코드 API로 시군구를 확인하고 후보를 돌려준다. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const lookup = await lookupRegion(q);
    return Response.json({ ...lookup, source: SOURCE.legalDong });
  } catch (error) {
    return errorResponse(error);
  }
}
