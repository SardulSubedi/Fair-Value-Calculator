import type { MethodResult, ValuationPreferences } from "@/lib/valuation/types";

export type EnsembleWeights = Record<string, number>;

export function defaultWeights(results: MethodResult[], prefs: ValuationPreferences): EnsembleWeights {
  const usable = results.filter((r) => typeof r.fairValuePerShare === "number" && !r.skipped);
  const w: EnsembleWeights = {};
  if (!usable.length) return w;
  const base = 1 / usable.length;
  for (const r of usable) w[r.methodId] = base;

  if (prefs.style === "conservative") {
    if (w.multiples_pe) w.multiples_pe *= 1.15;
    if (w.dcf_fcff) w.dcf_fcff *= 1.05;
  }
  if (prefs.style === "aggressive") {
    if (w.dcf_fcff) w.dcf_fcff *= 1.15;
  }
  if (prefs.emphasis === "income") {
    if (w.multiples_pe) w.multiples_pe *= 1.2;
  }
  if (prefs.emphasis === "growth") {
    if (w.dcf_fcff) w.dcf_fcff *= 1.15;
  }

  const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(w)) w[k] = w[k]! / sum;
  return w;
}

/** Apply user slider overrides then renormalize to sum to 1 across returned keys. */
export function applyEnsembleOverrides(base: EnsembleWeights, overrides?: Record<string, number>): EnsembleWeights {
  if (!overrides || !Object.keys(overrides).length) return base;
  const w: EnsembleWeights = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) w[k] = v;
  }
  const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(w)) w[k] = w[k]! / sum;
  return w;
}

export function weightedFairValue(results: MethodResult[], weights: EnsembleWeights) {
  let sum = 0;
  let wsum = 0;
  for (const r of results) {
    const w = weights[r.methodId] ?? 0;
    if (typeof r.fairValuePerShare === "number" && w > 0) {
      sum += r.fairValuePerShare * w;
      wsum += w;
    }
  }
  if (!wsum) return null;
  return sum / wsum;
}
