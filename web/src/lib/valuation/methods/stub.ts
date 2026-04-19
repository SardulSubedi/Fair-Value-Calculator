import { z } from "zod";
import type { MethodResult, ValuationContext } from "@/lib/valuation/types";

const emptyInputs = z.object({});

export function notImplemented(
  id: string,
  label: string,
  tier: 1 | 2 | 3,
  reason: string,
): (ctx: ValuationContext, inputs: unknown) => MethodResult {
  return (ctx, inputs) => {
    void ctx;
    void inputs;
    return {
      methodId: id,
      label,
      tier,
      fairValuePerShare: null,
      currency: "USD",
      skipped: true,
      skipReason: reason,
      trace: { steps: [{ label: "Status", value: reason }] },
      warnings: [],
      evidence: [],
    };
  };
}

export { emptyInputs };
