import { z } from "zod";
import type { MethodResult, ValuationContext } from "@/lib/valuation/types";

export const multiplesPeInputs = z.object({
  eps: z.number(),
  peMultiple: z.number().positive(),
});

export const multiplesEvEbitdaInputs = z.object({
  ebitda: z.number(),
  evEbitdaMultiple: z.number().positive(),
  netDebt: z.number().default(0),
  cash: z.number().default(0),
  sharesOutstanding: z.number().positive(),
});

export const multiplesPbInputs = z.object({
  bookValuePerShare: z.number(),
  pbMultiple: z.number().positive(),
});

export const multiplesPsInputs = z.object({
  revenuePerShare: z.number(),
  psMultiple: z.number().positive(),
});

export function runMultiplesPe(ctx: ValuationContext, raw: z.infer<typeof multiplesPeInputs>): MethodResult {
  const inputs = multiplesPeInputs.parse(raw);
  const eps = inputs.eps;
  const fair = eps * inputs.peMultiple;
  const f = ctx.market.fundamentals;
  return {
    methodId: "multiples_pe",
    label: "Trading multiple: P/E",
    tier: 1,
    fairValuePerShare: fair,
    currency: "USD",
    trace: {
      steps: [
        { label: "EPS", value: eps.toFixed(2) },
        { label: "P/E multiple", value: String(inputs.peMultiple) },
        { label: "Implied price", value: fair.toFixed(2), formula: "EPS × P/E" },
      ],
    },
    warnings: eps <= 0 ? ["EPS is non-positive—P/E fair value may not be economically meaningful."] : [],
    evidence: f?.epsDiluted
      ? [
          {
            id: "sec-eps",
            source: "sec_edgar",
            label: "EPS (annual, from facts used for sanity)",
            value: String(f.epsDiluted),
            confidence: "medium",
          },
        ]
      : [],
  };
}

export function runMultiplesPb(ctx: ValuationContext, raw: z.infer<typeof multiplesPbInputs>): MethodResult {
  const inputs = multiplesPbInputs.parse(raw);
  const fair = inputs.bookValuePerShare * inputs.pbMultiple;
  const f = ctx.market.fundamentals;
  const impliedBvps =
    f?.bookValueEquity && f.sharesOutstanding ? f.bookValueEquity / f.sharesOutstanding : undefined;
  return {
    methodId: "multiples_pb",
    label: "Trading multiple: P/B",
    tier: 1,
    fairValuePerShare: fair,
    currency: "USD",
    trace: {
      steps: [
        { label: "Book value / share", value: inputs.bookValuePerShare.toFixed(2) },
        { label: "P/B multiple", value: String(inputs.pbMultiple) },
        { label: "Implied price", value: fair.toFixed(2), formula: "BVPS × P/B" },
      ],
    },
    warnings:
      inputs.bookValuePerShare <= 0
        ? ["Non-positive book value per share—P/B may not be meaningful."]
        : [],
    evidence:
      impliedBvps != null
        ? [
            {
              id: "sec-bvps",
              source: "sec_edgar",
              label: "Implied BVPS from latest annual equity / shares",
              value: impliedBvps.toFixed(2),
              confidence: "medium",
            },
          ]
        : [],
  };
}

export function runMultiplesPs(ctx: ValuationContext, raw: z.infer<typeof multiplesPsInputs>): MethodResult {
  const inputs = multiplesPsInputs.parse(raw);
  const fair = inputs.revenuePerShare * inputs.psMultiple;
  const f = ctx.market.fundamentals;
  const impliedRps = f?.revenue && f.sharesOutstanding ? f.revenue / f.sharesOutstanding : undefined;
  return {
    methodId: "multiples_ps",
    label: "Trading multiple: P/S",
    tier: 1,
    fairValuePerShare: fair,
    currency: "USD",
    trace: {
      steps: [
        { label: "Revenue / share", value: inputs.revenuePerShare.toFixed(2) },
        { label: "P/S multiple", value: String(inputs.psMultiple) },
        { label: "Implied price", value: fair.toFixed(2), formula: "RPS × P/S" },
      ],
    },
    warnings: inputs.revenuePerShare <= 0 ? ["Non-positive revenue per share."] : [],
    evidence:
      impliedRps != null
        ? [
            {
              id: "sec-rps",
              source: "sec_edgar",
              label: "Implied RPS from latest annual revenue / shares",
              value: impliedRps.toFixed(2),
              confidence: "medium",
            },
          ]
        : [],
  };
}

export function runMultiplesEvEbitda(
  ctx: ValuationContext,
  raw: z.infer<typeof multiplesEvEbitdaInputs>,
): MethodResult {
  const inputs = multiplesEvEbitdaInputs.parse(raw);
  const ev = inputs.ebitda * inputs.evEbitdaMultiple;
  const equity = ev + inputs.cash - inputs.netDebt;
  const perShare = equity / inputs.sharesOutstanding;
  return {
    methodId: "multiples_ev_ebitda",
    label: "Trading multiple: EV/EBITDA",
    tier: 1,
    fairValuePerShare: perShare,
    currency: "USD",
    trace: {
      steps: [
        { label: "EBITDA", value: inputs.ebitda.toLocaleString() },
        { label: "EV/EBITDA", value: String(inputs.evEbitdaMultiple) },
        { label: "Implied EV", value: ev.toLocaleString(), formula: "EBITDA × multiple" },
        { label: "Equity value", value: equity.toLocaleString(), formula: "EV + cash - net debt" },
        { label: "Fair value / share", value: perShare.toFixed(2) },
      ],
    },
    warnings: [],
    evidence: [],
  };
}
