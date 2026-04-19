import type { ValuationContext } from "@/lib/valuation/types";
import { runDcfFcff, type DcfFcffInputs } from "@/lib/valuation/methods/dcf";

function makeRng(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export type DcfMonteCarloSpec = {
  samples: number;
  seed: number;
  wacc?: { min: number; max: number };
  fcfGrowthExplicit?: { min: number; max: number };
  terminalGrowth?: { min: number; max: number };
};

export function runDcfMonteCarlo(
  ctx: ValuationContext,
  base: DcfFcffInputs,
  spec: DcfMonteCarloSpec,
) {
  const rand = makeRng(spec.seed);
  const uniform = (a: number, b: number) => a + rand() * (b - a);
  const values: number[] = [];
  for (let i = 0; i < spec.samples; i++) {
    const wacc = spec.wacc ? uniform(spec.wacc.min, spec.wacc.max) : base.wacc;
    const fcfGrowthExplicit = spec.fcfGrowthExplicit
      ? uniform(spec.fcfGrowthExplicit.min, spec.fcfGrowthExplicit.max)
      : base.fcfGrowthExplicit;
    const terminalGrowth = spec.terminalGrowth
      ? clamp(uniform(spec.terminalGrowth.min, spec.terminalGrowth.max), -0.02, base.wacc - 0.005)
      : base.terminalGrowth;
    const sample: DcfFcffInputs = {
      ...base,
      wacc: clamp(wacc, 0.02, 0.3),
      fcfGrowthExplicit: clamp(fcfGrowthExplicit, -0.5, 0.5),
      terminalGrowth,
    };
    const res = runDcfFcff(ctx, sample);
    if (typeof res.fairValuePerShare === "number" && Number.isFinite(res.fairValuePerShare)) {
      values.push(res.fairValuePerShare);
    }
  }
  values.sort((a, b) => a - b);
  const pct = (p: number) => values[Math.floor((values.length - 1) * p)] ?? null;
  return {
    n: values.length,
    p05: pct(0.05),
    p25: pct(0.25),
    p50: pct(0.5),
    p75: pct(0.75),
    p95: pct(0.95),
    histogram: bucketHistogram(values, 16),
  };
}

function bucketHistogram(values: number[], bins: number) {
  if (!values.length) return [];
  const min = values[0]!;
  const max = values[values.length - 1]!;
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / width)));
    counts[idx]++;
  }
  return counts.map((count, i) => ({
    label: `${(min + i * width).toFixed(1)}–${(min + (i + 1) * width).toFixed(1)}`,
    count,
  }));
}
