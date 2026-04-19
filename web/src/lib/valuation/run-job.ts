import { diagnoseMethodResult, methodDisagreementStats } from "@/lib/valuation/diagnostics";
import { couplingWarnings } from "@/lib/valuation/assumption-graph";
import { applyEnsembleOverrides, defaultWeights, weightedFairValue } from "@/lib/valuation/ensemble";
import { runDcfMonteCarlo, type DcfMonteCarloSpec } from "@/lib/valuation/monte-carlo";
import { dcfTornado } from "@/lib/valuation/sensitivity";
import type { DcfFcffInputs } from "@/lib/valuation/methods/dcf";
import { runRegisteredMethod } from "@/lib/valuation/registry";
import type { MarketSnapshot, MethodResult, ValuationContext, ValuationPreferences } from "@/lib/valuation/types";

export type MonteCarloRequest = {
  enabled: boolean;
  samples?: number;
  seed?: number;
  dcf?: {
    wacc?: { min: number; max: number };
    fcfGrowthExplicit?: { min: number; max: number };
    terminalGrowth?: { min: number; max: number };
  };
};

export function runValuationForTicker(input: {
  ticker: string;
  market: MarketSnapshot;
  methods: string[];
  assumptions: Partial<{
    dcf_fcff: DcfFcffInputs;
    multiples_pe: { eps: number; peMultiple: number };
    multiples_ev_ebitda: {
      ebitda: number;
      evEbitdaMultiple: number;
      netDebt?: number;
      cash?: number;
      sharesOutstanding: number;
    };
    multiples_pb: { bookValuePerShare: number; pbMultiple: number };
    multiples_ps: { revenuePerShare: number; psMultiple: number };
  }>;
  prefs?: ValuationPreferences;
  monteCarlo?: MonteCarloRequest;
  ensembleOverrides?: Record<string, number>;
  includeTornado?: boolean;
}) {
  const { ticker, market, methods, assumptions, prefs, monteCarlo: mc, ensembleOverrides, includeTornado } = input;
  const ctx: ValuationContext = { ticker: market.ticker, market };
  const results: MethodResult[] = [];
  for (const id of methods) {
    const raw = (assumptions as Record<string, unknown>)[id];
    if (raw === undefined) continue;
    try {
      results.push(runRegisteredMethod(id, ctx, raw));
    } catch {
      // invalid inputs for method
    }
  }
  const prefsResolved: ValuationPreferences = prefs ?? {
    style: "balanced",
    complexity: "few",
    emphasis: "balanced",
    allowAiInference: true,
  };
  let weights = defaultWeights(results, prefsResolved);
  weights = applyEnsembleOverrides(weights, ensembleOverrides);
  const consensus = weightedFairValue(results, weights);
  const diagnostics = results.map((r) => ({
    methodId: r.methodId,
    ...diagnoseMethodResult(ctx, r.methodId, r),
  }));
  const nums = results
    .map((r) => r.fairValuePerShare)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const disagreement = methodDisagreementStats(nums);

  let monteCarlo: ReturnType<typeof runDcfMonteCarlo> | null = null;
  if (mc?.enabled && assumptions.dcf_fcff) {
    const spec: DcfMonteCarloSpec = {
      samples: mc.samples ?? 1_500,
      seed: mc.seed ?? 42,
      wacc: mc.dcf?.wacc,
      fcfGrowthExplicit: mc.dcf?.fcfGrowthExplicit,
      terminalGrowth: mc.dcf?.terminalGrowth,
    };
    monteCarlo = runDcfMonteCarlo(ctx, assumptions.dcf_fcff, spec);
  }

  const cw = assumptions.dcf_fcff
    ? couplingWarnings({
        fcfGrowthExplicit: assumptions.dcf_fcff.fcfGrowthExplicit,
        terminalGrowth: assumptions.dcf_fcff.terminalGrowth,
        wacc: assumptions.dcf_fcff.wacc,
        operatingMargin:
          market.fundamentals?.revenue && market.fundamentals.operatingIncome !== undefined
            ? market.fundamentals.operatingIncome / market.fundamentals.revenue
            : undefined,
      })
    : [];

  const tornado =
    includeTornado && assumptions.dcf_fcff ? dcfTornado(ctx, assumptions.dcf_fcff) : null;

  return {
    ticker,
    market,
    results,
    weights,
    consensus,
    diagnostics,
    disagreement,
    monteCarlo,
    coupling: cw,
    tornado,
    evidenceProvenance: market.dataSources ?? [],
    evidenceCompleteness: market.dataCompleteness,
  };
}
