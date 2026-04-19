import type { ValuationContext, ValuationMethodDefinition } from "@/lib/valuation/types";
import { dcfFcffInputs, runDcfFcff } from "@/lib/valuation/methods/dcf";
import {
  multiplesEvEbitdaInputs,
  multiplesPbInputs,
  multiplesPeInputs,
  multiplesPsInputs,
  runMultiplesEvEbitda,
  runMultiplesPb,
  runMultiplesPe,
  runMultiplesPs,
} from "@/lib/valuation/methods/multiples";
import { emptyInputs, notImplemented } from "@/lib/valuation/methods/stub";

const stub = (id: string, label: string, tier: 1 | 2 | 3, family: string): ValuationMethodDefinition => ({
  id,
  label,
  tier,
  family,
  inputSchema: emptyInputs,
  eligibility: () => ({ eligible: false, reason: "Not implemented in this build (registry placeholder)." }),
  execute: (ctx, inputs) => notImplemented(id, label, tier, "Engine not implemented yet.")(ctx, inputs),
});

export const valuationRegistry: ValuationMethodDefinition[] = [
  {
    id: "dcf_fcff",
    label: "DCF (FCFF)",
    tier: 1,
    family: "intrinsic",
    inputSchema: dcfFcffInputs,
    eligibility: (ctx) =>
      ctx.market.dataCompleteness < 0.2
        ? { eligible: true, reason: "Low SEC field coverage—double-check cash-flow and capital structure inputs." }
        : { eligible: true },
    execute: (ctx, inputs) => runDcfFcff(ctx, dcfFcffInputs.parse(inputs)),
  },
  {
    id: "multiples_pe",
    label: "P/E multiple",
    tier: 1,
    family: "relative",
    inputSchema: multiplesPeInputs,
    eligibility: () => ({ eligible: true }),
    execute: (ctx, inputs) => runMultiplesPe(ctx, multiplesPeInputs.parse(inputs)),
  },
  {
    id: "multiples_ev_ebitda",
    label: "EV/EBITDA multiple",
    tier: 1,
    family: "relative",
    inputSchema: multiplesEvEbitdaInputs,
    eligibility: () => ({ eligible: true }),
    execute: (ctx, inputs) => runMultiplesEvEbitda(ctx, multiplesEvEbitdaInputs.parse(inputs)),
  },
  {
    id: "multiples_pb",
    label: "Trading multiple: P/B",
    tier: 1,
    family: "relative",
    inputSchema: multiplesPbInputs,
    eligibility: (ctx) =>
      ctx.market.fundamentals?.bookValueEquity && ctx.market.fundamentals.sharesOutstanding
        ? { eligible: true }
        : { eligible: true, reason: "SEC book value / shares missing—enter BVPS manually." },
    execute: (ctx, inputs) => runMultiplesPb(ctx, multiplesPbInputs.parse(inputs)),
  },
  {
    id: "multiples_ps",
    label: "Trading multiple: P/S",
    tier: 1,
    family: "relative",
    inputSchema: multiplesPsInputs,
    eligibility: (ctx) =>
      ctx.market.fundamentals?.revenue && ctx.market.fundamentals.sharesOutstanding
        ? { eligible: true }
        : { eligible: true, reason: "SEC revenue / shares missing—enter RPS manually." },
    execute: (ctx, inputs) => runMultiplesPs(ctx, multiplesPsInputs.parse(inputs)),
  },
  stub("dcf_fcfe", "DCF (FCFE)", 1, "intrinsic"),
  stub("ddm_gordon", "DDM (Gordon)", 1, "intrinsic"),
  stub("ddm_two_stage", "DDM (two-stage / H)", 1, "intrinsic"),
  stub("residual_income", "Residual income", 1, "intrinsic"),
  stub("economic_profit", "Economic profit / EVA-style", 2, "intrinsic"),
  stub("apv", "APV", 2, "intrinsic"),
  stub("epv", "Earnings power value (EPV)", 2, "intrinsic"),
  stub("owner_earnings", "Owner earnings (maintenance capex)", 2, "intrinsic"),
  stub("reverse_dcf", "Reverse DCF", 1, "diagnostic"),
  stub("multiples_peg", "PEG ratio comp", 1, "relative"),
  stub("multiples_ev_ebit", "EV/EBIT multiple", 1, "relative"),
  stub("multiples_ev_sales", "EV/Sales multiple", 1, "relative"),
  stub("multiples_ev_fcf", "EV/FCF multiple", 2, "relative"),
  stub("multiples_regression_peers", "Regression vs peers", 2, "relative"),
  stub("nav_reit", "NAV (REIT-style)", 2, "assets"),
  stub("nav_resources", "NAV (resources)", 3, "assets"),
  stub("adjusted_book", "Adjusted book value", 2, "assets"),
  stub("liquidation_value", "Liquidation value", 2, "assets"),
  stub("replacement_cost", "Replacement cost", 3, "assets"),
  stub("sotp_multiples", "SOTP (multiples)", 2, "sum_of_parts"),
  stub("sotp_intrinsic", "SOTP (intrinsic)", 2, "sum_of_parts"),
  stub("precedent_transactions", "Precedent transactions", 2, "transactions"),
  stub("lbo_floor", "LBO feasibility (floor)", 3, "transactions"),
  stub("merger_arb", "Merger arb / event", 3, "transactions"),
  stub("real_options", "Real options (template)", 3, "contingent"),
  stub("vc_scenario", "VC / scenario table", 3, "early_stage"),
  stub("pwerm", "PWERM / milestone scenarios", 3, "early_stage"),
];

const byId = Object.fromEntries(valuationRegistry.map((m) => [m.id, m]));

export function getMethod(id: string): ValuationMethodDefinition | undefined {
  return byId[id];
}

export function listMethodMetas() {
  return valuationRegistry.map((m) => ({
    id: m.id,
    label: m.label,
    tier: m.tier,
    family: m.family,
  }));
}

export function parseMethodInputs(methodId: string, body: unknown) {
  const method = getMethod(methodId);
  if (!method) throw new Error(`Unknown method: ${methodId}`);
  return method.inputSchema.parse(body);
}

export function runRegisteredMethod(
  methodId: string,
  ctx: ValuationContext,
  inputs: unknown,
): ReturnType<ValuationMethodDefinition["execute"]> {
  const method = getMethod(methodId);
  if (!method) {
    throw new Error(`Unknown method: ${methodId}`);
  }
  const elig = method.eligibility(ctx);
  if (!elig.eligible) {
    return {
      methodId,
      label: method.label,
      tier: method.tier,
      fairValuePerShare: null,
      currency: "USD",
      skipped: true,
      skipReason: elig.reason ?? "Not eligible",
      trace: { steps: [{ label: "Eligibility", value: elig.reason ?? "Not eligible" }] },
      warnings: [],
      evidence: [],
    };
  }
  method.inputSchema.parse(inputs);
  return method.execute(ctx, inputs);
}
