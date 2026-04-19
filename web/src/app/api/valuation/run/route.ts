import { NextResponse } from "next/server";
import { z } from "zod";
import { buildMarketSnapshot } from "@/lib/market/provider";
import { monteCarloRangeOverlap } from "@/lib/valuation/sensitivity";
import { dcfFcffInputs } from "@/lib/valuation/methods/dcf";
import { multiplesPbInputs, multiplesPsInputs } from "@/lib/valuation/methods/multiples";
import { runValuationForTicker } from "@/lib/valuation/run-job";
import type { ValuationPreferences } from "@/lib/valuation/types";

const prefsSchema = z.object({
  style: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
  complexity: z.enum(["few", "many"]).default("few"),
  emphasis: z.enum(["income", "growth", "assets", "balanced"]).default("balanced"),
  allowAiInference: z.boolean().default(true),
});

const mcSchema = z
  .object({
    enabled: z.boolean(),
    samples: z.number().min(50).max(20_000).optional(),
    seed: z.number().optional(),
    dcf: z
      .object({
        wacc: z.object({ min: z.number(), max: z.number() }).optional(),
        fcfGrowthExplicit: z.object({ min: z.number(), max: z.number() }).optional(),
        terminalGrowth: z.object({ min: z.number(), max: z.number() }).optional(),
      })
      .optional(),
  })
  .optional();

const assumptionsSchema = z
  .object({
    dcf_fcff: dcfFcffInputs.optional(),
    multiples_pe: z.object({ eps: z.number(), peMultiple: z.number() }).optional(),
    multiples_ev_ebitda: z
      .object({
        ebitda: z.number(),
        evEbitdaMultiple: z.number(),
        netDebt: z.number().optional(),
        cash: z.number().optional(),
        sharesOutstanding: z.number(),
      })
      .optional(),
    multiples_pb: multiplesPbInputs.optional(),
    multiples_ps: multiplesPsInputs.optional(),
  })
  .partial();

const bodySchema = z.object({
  mode: z.enum(["one", "compare"]),
  tickers: z.array(z.string().min(1)).min(1).max(2),
  methods: z.array(z.string()),
  lastPrices: z.array(z.number().positive().optional()).optional(),
  assumptionsByTicker: z.record(z.string(), assumptionsSchema),
  preferences: prefsSchema.optional(),
  monteCarlo: mcSchema,
  ensembleOverrides: z.record(z.string(), z.number().min(0)).optional(),
  includeTornado: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = bodySchema.parse(json);
    if (body.mode === "compare" && body.tickers.length !== 2) {
      return NextResponse.json({ error: "Compare mode requires exactly two tickers." }, { status: 400 });
    }
    const prefs = body.preferences ? prefsSchema.parse(body.preferences) : undefined;

    const markets = await Promise.all(
      body.tickers.map((t, i) =>
        buildMarketSnapshot(t, { lastPrice: body.lastPrices?.[i] }),
      ),
    );

    const outputs = markets.map((m, idx) => {
      const t = m.ticker;
      const rawKey = body.tickers[idx] ?? t;
      const assumptions =
        body.assumptionsByTicker[t] ?? body.assumptionsByTicker[rawKey] ?? body.assumptionsByTicker[rawKey.toUpperCase()];
      if (!assumptions) {
        throw new Error(`Missing assumptions for ${t}`);
      }
      return runValuationForTicker({
        ticker: t,
        market: m,
        methods: body.methods,
        assumptions,
        prefs: prefs as ValuationPreferences | undefined,
        monteCarlo: body.monteCarlo,
        ensembleOverrides: body.ensembleOverrides,
        includeTornado: body.includeTornado ?? true,
      });
    });

    let compareMcOverlap: ReturnType<typeof monteCarloRangeOverlap> | null = null;
    if (outputs.length === 2 && outputs[0]?.monteCarlo && outputs[1]?.monteCarlo) {
      compareMcOverlap = monteCarloRangeOverlap(outputs[0].monteCarlo, outputs[1].monteCarlo);
    }

    const evidenceSymmetry = {
      a: outputs[0]?.evidenceCompleteness ?? 0,
      b: outputs[1]?.evidenceCompleteness ?? null,
      note:
        outputs.length === 2
          ? "Compare SEC coverage (completeness) alongside prices—uneven filings quality skews comparability."
          : null,
    };

    return NextResponse.json({ ok: true, outputs, compareMcOverlap, evidenceSymmetry });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
