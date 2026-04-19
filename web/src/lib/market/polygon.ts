import type { QuoteResult } from "@/lib/market/market-types";
import { normalizeTicker } from "@/lib/market/sec-edgar";

/** Polygon free tier: previous close aggregate when `POLYGON_API_KEY` is set. */
export async function fetchPolygonPrevClose(tickerRaw: string): Promise<QuoteResult> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) {
    return { source: "polygon", message: "POLYGON_API_KEY not configured." };
  }
  const t = normalizeTicker(tickerRaw);
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(t)}/prev?adjusted=true&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    return { source: "polygon", message: `Polygon error ${res.status}` };
  }
  const json = (await res.json()) as {
    results?: Array<{ c?: number }>;
    status?: string;
  };
  const c = json.results?.[0]?.c;
  if (typeof c !== "number") {
    return { source: "polygon", message: "Polygon returned no close (try US ticker format)." };
  }
  return { lastPrice: c, currency: "USD", source: "polygon" };
}
