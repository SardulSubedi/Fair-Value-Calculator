import { NextResponse } from "next/server";
import { z } from "zod";
import { buildMarketSnapshot } from "@/lib/market/provider";
import { pickAutoMethods } from "@/lib/valuation/auto-methods";

const bodySchema = z.object({
  ticker: z.string().min(1),
  lastPrice: z.number().positive().optional(),
  preferences: z
    .object({
      style: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
      complexity: z.enum(["few", "many"]).default("few"),
      emphasis: z.enum(["income", "growth", "assets", "balanced"]).default("balanced"),
      allowAiInference: z.boolean().default(true),
    })
    .default({
      style: "balanced",
      complexity: "few",
      emphasis: "balanced",
      allowAiInference: true,
    }),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const market = await buildMarketSnapshot(body.ticker, { lastPrice: body.lastPrice });
    const { methods, rationale } = pickAutoMethods(market, body.preferences);
    return NextResponse.json({ ok: true, methods, rationale, market });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
