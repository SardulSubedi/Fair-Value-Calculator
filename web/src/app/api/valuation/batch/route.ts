import { NextResponse } from "next/server";
import { z } from "zod";
import { buildMarketSnapshot } from "@/lib/market/provider";
import { dcfFcffInputs } from "@/lib/valuation/methods/dcf";
import { runValuationForTicker } from "@/lib/valuation/run-job";
import type { ValuationPreferences } from "@/lib/valuation/types";

const dcfDefaults = {
  fcf0: 1_000_000_000,
  explicitYears: 5,
  fcfGrowthExplicit: 0.05,
  terminalGrowth: 0.02,
  wacc: 0.09,
  netDebt: 80_000_000_000,
  cashAndEquivalents: 60_000_000_000,
  sharesOutstanding: 16_000_000_000,
};

const bodySchema = z.object({
  tickers: z.array(z.string().min(1)).min(1).max(25),
  methods: z.array(z.string()),
  template: z
    .object({
      dcf_fcff: dcfFcffInputs.partial().optional(),
      multiples_pe: z.object({ eps: z.number().optional(), peMultiple: z.number().optional() }).optional(),
    })
    .default({}),
  preferences: z
    .object({
      style: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
      complexity: z.enum(["few", "many"]).default("few"),
      emphasis: z.enum(["income", "growth", "assets", "balanced"]).default("balanced"),
      allowAiInference: z.boolean().default(true),
    })
    .optional(),
  includeTornado: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const prefs = body.preferences as ValuationPreferences | undefined;
    const rows = [];

    for (const raw of body.tickers) {
      const market = await buildMarketSnapshot(raw);
      const f = market.fundamentals;
      const assumptions: Record<string, unknown> = {};

      if (body.methods.includes("dcf_fcff")) {
        const merged = { ...dcfDefaults, ...body.template.dcf_fcff };
        if (f?.sharesOutstanding) merged.sharesOutstanding = f.sharesOutstanding;
        assumptions.dcf_fcff = dcfFcffInputs.parse(merged);
      }
      if (body.methods.includes("multiples_pe")) {
        assumptions.multiples_pe = {
          eps: f?.epsDiluted ?? body.template.multiples_pe?.eps ?? 1,
          peMultiple: body.template.multiples_pe?.peMultiple ?? 20,
        };
      }

      const out = runValuationForTicker({
        ticker: market.ticker,
        market,
        methods: body.methods,
        assumptions,
        prefs,
        includeTornado: body.includeTornado ?? false,
      });
      rows.push(out);
    }

    const consensusBand = rows
      .map((r) => r.consensus)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    const band =
      consensusBand.length === 0
        ? null
        : {
            min: Math.min(...consensusBand),
            max: Math.max(...consensusBand),
            median: [...consensusBand].sort((a, b) => a - b)[Math.floor(consensusBand.length / 2)]!,
          };

    return NextResponse.json({ ok: true, rows, aggregate: { count: rows.length, consensusBand: band } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
