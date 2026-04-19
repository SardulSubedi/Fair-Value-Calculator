import { z } from "zod";
import type { CalculationTrace, EvidenceEntry, MethodResult, ValuationContext } from "@/lib/valuation/types";

export const dcfFcffInputs = z.object({
  fcf0: z.number(),
  explicitYears: z.number().min(1).max(15).default(5),
  fcfGrowthExplicit: z.number().min(-0.5).max(0.5),
  terminalGrowth: z.number().min(-0.02).max(0.06),
  wacc: z.number().min(0.02).max(0.3),
  netDebt: z.number().default(0),
  cashAndEquivalents: z.number().default(0),
  sharesOutstanding: z.number().positive(),
});

export type DcfFcffInputs = z.infer<typeof dcfFcffInputs>;

export function runDcfFcff(ctx: ValuationContext, raw: DcfFcffInputs): MethodResult {
  const inputs = dcfFcffInputs.parse(raw);
  const trace: CalculationTrace = { steps: [] };
  const warnings: string[] = [];
  const evidence: EvidenceEntry[] = [];

  if (inputs.terminalGrowth >= inputs.wacc) {
    warnings.push("Terminal growth must stay below WACC for Gordon terminal to be finite.");
  }

  const f = ctx.market.fundamentals;
  if (f?.sharesOutstanding && Math.abs(f.sharesOutstanding - inputs.sharesOutstanding) / f.sharesOutstanding > 0.05) {
    warnings.push("Shares outstanding differs from latest SEC annual by >5%—confirm dilution/buybacks.");
  }

  let fcf = inputs.fcf0;
  let pvSum = 0;
  for (let t = 1; t <= inputs.explicitYears; t++) {
    fcf *= 1 + inputs.fcfGrowthExplicit;
    const discount = Math.pow(1 + inputs.wacc, t);
    const pv = fcf / discount;
    pvSum += pv;
    trace.steps.push({
      label: `PV FCF year ${t}`,
      value: pv.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      detail: `FCF=${fcf.toFixed(0)}, discount=${discount.toFixed(4)}`,
    });
  }

  const fcfTerminalStart = fcf * (1 + inputs.terminalGrowth);
  const spread = inputs.wacc - inputs.terminalGrowth;
  if (spread <= 0) {
    return {
      methodId: "dcf_fcff",
      label: "DCF (FCFF)",
      tier: 1,
      fairValuePerShare: null,
      currency: "USD",
      skipped: true,
      skipReason: "WACC must exceed terminal growth.",
      trace: { steps: [{ label: "Error", value: "Invalid terminal vs WACC" }] },
      warnings,
      evidence: [],
    };
  }
  const terminalValue = fcfTerminalStart / spread;
  const discountTerminal = Math.pow(1 + inputs.wacc, inputs.explicitYears);
  const pvTerminal = terminalValue / discountTerminal;
  trace.steps.push({
    label: "Terminal value (Gordon growth)",
    value: terminalValue.toLocaleString(undefined, { maximumFractionDigits: 0 }),
    formula: "FCF_{n+1} / (WACC - g)",
  });
  trace.steps.push({
    label: "PV of terminal value",
    value: pvTerminal.toLocaleString(undefined, { maximumFractionDigits: 0 }),
  });

  const enterpriseValue = pvSum + pvTerminal;
  trace.steps.push({
    label: "Enterprise value",
    value: enterpriseValue.toLocaleString(undefined, { maximumFractionDigits: 0 }),
    formula: "Sum(PV explicit FCF) + PV(terminal)",
  });

  const equityValue = enterpriseValue + inputs.cashAndEquivalents - inputs.netDebt;
  trace.steps.push({
    label: "Equity value",
    value: equityValue.toLocaleString(undefined, { maximumFractionDigits: 0 }),
    formula: "EV + cash - net debt",
  });

  const perShare = equityValue / inputs.sharesOutstanding;
  trace.steps.push({
    label: "Fair value / share",
    value: perShare.toFixed(2),
    formula: "Equity value / shares outstanding",
  });

  if (f?.entityName) {
    evidence.push({
      id: "sec-entity",
      source: "sec_edgar",
      label: "Entity (SEC)",
      value: f.entityName,
      citation: `CIK ${f.cik}`,
      confidence: "high",
    });
  }

  return {
    methodId: "dcf_fcff",
    label: "DCF (FCFF)",
    tier: 1,
    fairValuePerShare: perShare,
    currency: "USD",
    trace,
    warnings,
    evidence,
  };
}
