import { NextResponse } from "next/server";
import { z } from "zod";
import { proposeAssumptionsWithAi } from "@/lib/ai/assumptions";
import { buildMarketSnapshot } from "@/lib/market/provider";

const bodySchema = z.object({
  ticker: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const { ticker } = bodySchema.parse(await req.json());
    const market = await buildMarketSnapshot(ticker);
    const summary = JSON.stringify(
      {
        entity: market.fundamentals?.entityName,
        revenue: market.fundamentals?.revenue,
        netIncome: market.fundamentals?.netIncome,
        eps: market.fundamentals?.epsDiluted,
        shares: market.fundamentals?.sharesOutstanding,
        messages: market.messages,
      },
      null,
      2,
    );
    const proposal = await proposeAssumptionsWithAi({ ticker, fundamentalsSummary: summary });
    return NextResponse.json({ ok: true, proposal, market });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
