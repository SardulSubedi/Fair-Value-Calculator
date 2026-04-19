/** Lightweight coupling hints between macro assumptions (expand over time). */

export type CouplingWarning = { field: string; message: string; severity: "info" | "warn" };

export function couplingWarnings(input: {
  fcfGrowthExplicit: number;
  terminalGrowth: number;
  wacc: number;
  operatingMargin?: number;
}): CouplingWarning[] {
  const out: CouplingWarning[] = [];
  if (input.terminalGrowth >= input.wacc - 0.002) {
    out.push({
      field: "terminalGrowth",
      message: "Terminal growth approaches WACC; Gordon terminal becomes unstable.",
      severity: "warn",
    });
  }
  if (input.fcfGrowthExplicit > 0.12 && (input.operatingMargin ?? 0) > 0.35) {
    out.push({
      field: "fcfGrowthExplicit",
      message: "Very high growth with very high margins is uncommon—check competitive pressure.",
      severity: "info",
    });
  }
  return out;
}
