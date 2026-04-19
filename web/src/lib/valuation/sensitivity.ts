import type { ValuationContext } from "@/lib/valuation/types";
import { runDcfFcff, type DcfFcffInputs } from "@/lib/valuation/methods/dcf";

export type TornadoRow = {
  driver: string;
  field: "wacc" | "fcfGrowthExplicit" | "terminalGrowth";
  lowValue: number;
  highValue: number;
  fairLow: number | null;
  fairBase: number | null;
  fairHigh: number | null;
};

export function dcfTornado(ctx: ValuationContext, base: DcfFcffInputs): TornadoRow[] {
  const baseRes = runDcfFcff(ctx, base);
  const fairBase = baseRes.fairValuePerShare;

  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  const scenarios: Array<{
    driver: string;
    field: TornadoRow["field"];
    lowValue: number;
    highValue: number;
  }> = [
    {
      driver: "WACC",
      field: "wacc",
      lowValue: clamp(base.wacc * 0.92, 0.03, 0.25),
      highValue: clamp(base.wacc * 1.08, 0.03, 0.25),
    },
    {
      driver: "Explicit FCF growth",
      field: "fcfGrowthExplicit",
      lowValue: clamp(base.fcfGrowthExplicit - 0.02, -0.2, 0.25),
      highValue: clamp(base.fcfGrowthExplicit + 0.02, -0.2, 0.25),
    },
    {
      driver: "Terminal growth",
      field: "terminalGrowth",
      lowValue: clamp(base.terminalGrowth - 0.005, -0.02, base.wacc - 0.01),
      highValue: clamp(base.terminalGrowth + 0.005, -0.02, base.wacc - 0.01),
    },
  ];

  return scenarios.map((s) => {
    const lowIn = { ...base, [s.field]: s.lowValue } as DcfFcffInputs;
    const highIn = { ...base, [s.field]: s.highValue } as DcfFcffInputs;
    const fairLow = runDcfFcff(ctx, lowIn).fairValuePerShare;
    const fairHigh = runDcfFcff(ctx, highIn).fairValuePerShare;
    return {
      driver: s.driver,
      field: s.field,
      lowValue: s.lowValue,
      highValue: s.highValue,
      fairLow,
      fairBase,
      fairHigh,
    };
  });
}

export function monteCarloRangeOverlap(
  a: { p25: number | null; p75: number | null },
  b: { p25: number | null; p75: number | null },
): { overlap: boolean; note: string } {
  if (a.p25 == null || a.p75 == null || b.p25 == null || b.p75 == null) {
    return { overlap: false, note: "Monte Carlo bands unavailable for overlap." };
  }
  const lo = Math.max(a.p25, b.p25);
  const hi = Math.min(a.p75, b.p75);
  const overlap = lo <= hi;
  return {
    overlap,
    note: overlap
      ? `IQR overlap exists between ~${lo.toFixed(2)} and ~${hi.toFixed(2)} (DCF simulation bands).`
      : "No IQR overlap on DCF Monte Carlo bands (parameter uncertainty ranges do not intersect).",
  };
}
