import type { CompanyFactsSummary } from "@/lib/valuation/types";

/** Pluggable market backends (plan: adapter pattern). */
export type QuoteResult = {
  lastPrice?: number;
  currency?: string;
  source: "fmp" | "polygon" | "manual";
  message?: string;
};

export type FundamentalsResult = {
  fundamentals: CompanyFactsSummary | null;
  source: "sec_edgar";
  messages: string[];
};

export type MarketDataProvider = {
  id: string;
  fetchQuote(ticker: string): Promise<QuoteResult>;
};
