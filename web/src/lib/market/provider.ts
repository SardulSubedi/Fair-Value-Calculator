import { fetchFmpQuoteShort } from "@/lib/market/fmp";
import { fetchPolygonPrevClose } from "@/lib/market/polygon";
import { fetchCompanyFactsSummary, normalizeTicker } from "@/lib/market/sec-edgar";
import type { MarketSnapshot } from "@/lib/valuation/types";

function completeness(f: NonNullable<MarketSnapshot["fundamentals"]>): number {
  const keys: (keyof typeof f)[] = [
    "revenue",
    "netIncome",
    "epsDiluted",
    "sharesOutstanding",
    "bookValueEquity",
  ];
  const ok = keys.filter((k) => typeof f[k] === "number" && Number.isFinite(f[k] as number)).length;
  return ok / keys.length;
}

export async function buildMarketSnapshot(
  tickerRaw: string,
  opts?: { lastPrice?: number },
): Promise<MarketSnapshot> {
  const ticker = normalizeTicker(tickerRaw);
  const messages: string[] = [];
  const dataSources: string[] = [];
  let fundamentals;
  try {
    fundamentals = (await fetchCompanyFactsSummary(ticker)) ?? undefined;
    if (fundamentals) dataSources.push("sec_companyfacts");
    if (!fundamentals) messages.push("Ticker not found in SEC company map.");
  } catch (e) {
    messages.push(e instanceof Error ? e.message : "SEC fundamentals fetch failed.");
  }

  let lastPrice = opts?.lastPrice;
  if (lastPrice != null) {
    dataSources.push("manual_last_price");
  } else {
    const fmp = await fetchFmpQuoteShort(ticker);
    if (fmp.lastPrice != null) {
      lastPrice = fmp.lastPrice;
      dataSources.push("fmp_quote");
    } else if (fmp.message) {
      messages.push(`FMP: ${fmp.message}`);
    }
    if (lastPrice == null) {
      const poly = await fetchPolygonPrevClose(ticker);
      if (poly.lastPrice != null) {
        lastPrice = poly.lastPrice;
        dataSources.push("polygon_prev_close");
      } else if (poly.message) {
        messages.push(`Polygon: ${poly.message}`);
      }
    }
  }

  const dataCompleteness = fundamentals ? completeness(fundamentals) : 0;
  return {
    ticker,
    lastPrice,
    currency: "USD",
    fundamentals,
    dataCompleteness,
    messages,
    dataSources,
  };
}
