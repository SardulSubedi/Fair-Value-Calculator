import { NextResponse } from "next/server";
import { buildMarketSnapshot } from "@/lib/market/provider";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const last = searchParams.get("lastPrice");
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker is required" }, { status: 400 });
  }
  try {
    const lastPrice = last ? Number(last) : undefined;
    const market = await buildMarketSnapshot(ticker, { lastPrice });
    return NextResponse.json({ ok: true, market });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
