import type { z } from "zod";

export type ValuationMode = "one" | "compare";

export type MethodTier = 1 | 2 | 3;

export type TraceStep = {
  label: string;
  value: string;
  formula?: string;
  detail?: string;
};

export type CalculationTrace = {
  steps: TraceStep[];
};

export type EvidenceEntry = {
  id: string;
  source: "user" | "sec_edgar" | "fmp" | "polygon" | "ai_inferred" | "ai_cited";
  label: string;
  value: string;
  citation?: string;
  confidence: "high" | "medium" | "low";
};

export type MethodResult = {
  methodId: string;
  label: string;
  tier: MethodTier;
  fairValuePerShare: number | null;
  currency: string;
  skipped?: boolean;
  skipReason?: string;
  trace: CalculationTrace;
  warnings: string[];
  evidence: EvidenceEntry[];
};

export type CompanyFactsSummary = {
  ticker: string;
  cik: string;
  entityName?: string;
  fiscalYear?: number;
  revenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  epsDiluted?: number;
  sharesOutstanding?: number;
  totalAssets?: number;
  bookValueEquity?: number;
  dividendsPerShare?: number;
};

export type MarketSnapshot = {
  ticker: string;
  lastPrice?: number;
  currency: string;
  fundamentals?: CompanyFactsSummary;
  dataCompleteness: number;
  messages: string[];
  /** Provenance labels, e.g. `sec_companyfacts`, `fmp_quote`, `polygon_prev`. */
  dataSources?: string[];
};

export type ValuationContext = {
  ticker: string;
  market: MarketSnapshot;
};

export type ValuationPreferences = {
  style: "conservative" | "balanced" | "aggressive";
  complexity: "few" | "many";
  emphasis: "income" | "growth" | "assets" | "balanced";
  allowAiInference: boolean;
};

export type ValuationMethodDefinition = {
  id: string;
  label: string;
  tier: MethodTier;
  family: string;
  inputSchema: z.ZodTypeAny;
  eligibility: (ctx: ValuationContext) => { eligible: boolean; reason?: string };
  /** Inputs are validated via `inputSchema` in `runRegisteredMethod` before calling the engine. */
  execute: (ctx: ValuationContext, inputs: unknown) => MethodResult;
};
