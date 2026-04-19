import { callAiJson } from "@/lib/ai/client";

export type AiAssumptionProposal = {
  cited: Array<{ field: string; value: string; citation: string }>;
  inferred: Array<{ field: string; value: string; rationale: string }>;
  couplingsApplied: string[];
  model?: string;
};

export async function proposeAssumptionsWithAi(input: {
  ticker: string;
  fundamentalsSummary: string;
}): Promise<AiAssumptionProposal | { error: string }> {
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  const res = await callAiJson<AiAssumptionProposal>([
    {
      role: "system",
      content:
        "You are a financial modeling assistant. Return ONLY JSON matching schema: {cited:[{field,value,citation}], inferred:[{field,value,rationale}], couplingsApplied:[string]}. Use cited only for facts explicitly present in the user text. Mark everything else inferred.",
    },
    {
      role: "user",
      content: `Ticker: ${input.ticker}\nFacts:\n${input.fundamentalsSummary}\nPropose DCF inputs: fcf0, explicitYears, fcfGrowthExplicit, terminalGrowth, wacc, netDebt, cashAndEquivalents, sharesOutstanding. Use hybrid grounding: cite only from facts text.`,
    },
  ]);
  if (!res.ok) return { error: res.error };
  return { ...res.json, model };
}
