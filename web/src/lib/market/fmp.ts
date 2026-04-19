import type { QuoteResult } from "@/lib/market/market-types";
import { normalizeTicker } from "@/lib/market/sec-edgar";

/** Free-tier FMP: last price enrichment only when `FMP_API_KEY` is set. */
export async function fetchFmpQuoteShort(tickerRaw: string): Promise<QuoteResult> {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    return { source: "fmp", message: "FMP_API_KEY not configured." };
  }
  const ticker = normalizeTicker(tickerRaw);
  const url = `https://financialmodelingprep.com/stable/quote-short?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    return { source: "fmp", message: `FMP quote error ${res.status}` };
  }
  const data = (await res.json()) as Array<{ symbol: string; price: number }>;
  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row || typeof row.price !== "number") {
    return { source: "fmp", message: "FMP returned no price." };
  }
  return { lastPrice: row.price, currency: "USD", source: "fmp" };
}
