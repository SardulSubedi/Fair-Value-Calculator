import type { MethodResult, ValuationContext } from "@/lib/valuation/types";

export type RunDiagnostics = {
  missingInputs: string[];
  terminalDominance?: { pctOfEnterpriseValue: number; warning: string };
  cyclicalityNote?: string;
  normalizationNotes: string[];
};

export function diagnoseMethodResult(
  ctx: ValuationContext,
  methodId: string,
  result: MethodResult,
): RunDiagnostics {
  const missing: string[] = [];
  const f = ctx.market.fundamentals;
  if (methodId === "multiples_pe" && (!f?.epsDiluted || f.epsDiluted <= 0)) {
    missing.push("Diluted EPS from filings (enter EPS manually if missing).");
  }
  if (methodId === "multiples_ev_ebitda") {
    if (!f?.operatingIncome) missing.push("Operating income for EBITDA proxy.");
  }
  const normalizationNotes: string[] = [];
  if (f?.revenue && f.revenue > 0 && f.operatingIncome !== undefined) {
    const margin = f.operatingIncome / f.revenue;
    if (margin < -0.2 || margin > 0.55) {
      normalizationNotes.push("Operating margin is extreme vs typical operating bands—sanity-check filings timing.");
    }
  }

  let terminalDominance: RunDiagnostics["terminalDominance"];
  const tvStep = result.trace.steps.find((s) => s.label === "Terminal value (Gordon growth)");
  const evStep = result.trace.steps.find((s) => s.label === "Enterprise value");
  if (tvStep && evStep) {
    const tv = Number(tvStep.value.replace(/[^0-9.-eE]/g, ""));
    const ev = Number(evStep.value.replace(/[^0-9.-eE]/g, ""));
    if (Number.isFinite(tv) && Number.isFinite(ev) && ev !== 0) {
      const pct = Math.abs(tv / ev);
      if (pct > 0.75) {
        terminalDominance = {
          pctOfEnterpriseValue: pct,
          warning: `Terminal value is ~${(pct * 100).toFixed(0)}% of enterprise value—small WACC/g changes move value a lot.`,
        };
      }
    }
  }

  return {
    missingInputs: missing,
    terminalDominance,
    cyclicalityNote:
      f?.revenue && f.revenue > 5e10
        ? "Large revenue base: multiples may compress in downturns—consider through-cycle context."
        : undefined,
    normalizationNotes,
  };
}

export function methodDisagreementStats(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const mid = sorted[Math.floor(sorted.length / 2)]!;
  return { min, max, median: mid, spreadPct: mid !== 0 ? ((max - min) / Math.abs(mid)) * 100 : null };
}
