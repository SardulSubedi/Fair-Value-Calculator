import type { MarketSnapshot, ValuationPreferences } from "@/lib/valuation/types";
import { valuationRegistry } from "@/lib/valuation/registry";

export type AutoMethodRationale = {
  methodId: string;
  selected: boolean;
  reason: string;
  confidence: number;
};

export function pickAutoMethods(
  market: MarketSnapshot,
  prefs: ValuationPreferences,
): { methods: string[]; rationale: AutoMethodRationale[] } {
  const ctxLike = { ticker: market.ticker, market };
  const selected: string[] = ["dcf_fcff"];
  const rationale: AutoMethodRationale[] = [
    {
      methodId: "dcf_fcff",
      selected: true,
      reason: "Primary intrinsic anchor (FCFF DCF).",
      confidence: 0.92,
    },
  ];

  if (prefs.emphasis !== "assets") {
    selected.push("multiples_pe");
    rationale.push({
      methodId: "multiples_pe",
      selected: true,
      reason: "Relative valuation via earnings multiple.",
      confidence: 0.78,
    });
  } else {
    rationale.push({
      methodId: "multiples_pe",
      selected: false,
      reason: "De-emphasized for asset-heavy preference (still selectable manually).",
      confidence: 0.25,
    });
  }

  if (prefs.complexity !== "few") {
    selected.push("multiples_ev_ebitda");
    rationale.push({
      methodId: "multiples_ev_ebitda",
      selected: true,
      reason: "Adds enterprise-value lens when not in 'few methods' mode.",
      confidence: 0.74,
    });
  } else {
    rationale.push({
      methodId: "multiples_ev_ebitda",
      selected: false,
      reason: "Skipped in 'few methods' mode.",
      confidence: 0.2,
    });
  }

  for (const m of valuationRegistry) {
    if (selected.includes(m.id)) continue;
    const elig = m.eligibility(ctxLike);
    if (!elig.eligible) {
      rationale.push({ methodId: m.id, selected: false, reason: elig.reason ?? "Not eligible", confidence: 0 });
      continue;
    }
    const on = prefs.complexity === "many" && m.tier >= 2;
    rationale.push({
      methodId: m.id,
      selected: on,
      reason: on
        ? "Advanced/cross-check method enabled because 'many methods' is on."
        : "Registry placeholder / not enabled by default.",
      confidence: on ? 0.45 : 0.15,
    });
    if (on) selected.push(m.id);
  }

  return { methods: selected, rationale };
}
