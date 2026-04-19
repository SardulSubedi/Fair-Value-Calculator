import { cachedJson } from "@/lib/market/cache";
import type { CompanyFactsSummary } from "@/lib/valuation/types";

const TICKER_URL = "https://www.sec.gov/files/company_tickers.json";

function secHeaders(): HeadersInit {
  const ua =
    process.env.SEC_DATA_USER_AGENT ??
    "FairValueCalculator/0.1 (contact: local-dev@example.com)";
  return {
    "User-Agent": ua,
    Accept: "application/json",
  };
}

type TickerRow = { cik_str: number; ticker: string; title: string };

let tickerCache: { at: number; map: Map<string, number> } | null = null;

async function loadTickerToCik(): Promise<Map<string, number>> {
  const now = Date.now();
  if (tickerCache && now - tickerCache.at < 1000 * 60 * 60 * 12) {
    return tickerCache.map;
  }
  const res = await fetch(TICKER_URL, { headers: secHeaders(), next: { revalidate: 43200 } });
  if (!res.ok) {
    throw new Error(`SEC ticker map failed: ${res.status}`);
  }
  const rows = (await res.json()) as Record<string, TickerRow>;
  const map = new Map<string, number>();
  for (const row of Object.values(rows)) {
    map.set(row.ticker.toUpperCase(), row.cik_str);
  }
  tickerCache = { at: now, map };
  return map;
}

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replaceAll(".", "-");
}

export async function resolveCik(ticker: string): Promise<string | null> {
  const t = normalizeTicker(ticker);
  const map = await loadTickerToCik();
  const cikNum = map.get(t);
  if (!cikNum) return null;
  return String(cikNum).padStart(10, "0");
}

function latestAnnualNumber(
  units: Record<string, Array<{ end: string; val: number; fy?: number }>>,
): { fy?: number; val: number } | null {
  const usd = units["USD"] ?? units["usd"] ?? Object.values(units)[0];
  if (!usd?.length) return null;
  const sorted = [...usd].sort((a, b) => (b.fy ?? 0) - (a.fy ?? 0));
  const pick = sorted.find((x) => x.fy) ?? sorted[0];
  if (!pick) return null;
  return { fy: pick.fy, val: pick.val };
}

function extractFact(
  facts: Record<string, { units?: Record<string, Array<{ end: string; val: number; fy?: number }>> }>,
  tag: string,
): number | undefined {
  const node = facts[tag];
  if (!node?.units) return undefined;
  const v = latestAnnualNumber(node.units);
  return v?.val;
}

export async function fetchCompanyFactsSummary(ticker: string): Promise<CompanyFactsSummary | null> {
  const cik = await resolveCik(ticker);
  if (!cik) return null;
  return cachedJson(`sec:companyfacts:${cik}`, 60 * 60 * 1000, async () => {
    type FactsPayload = {
      cik: number;
      entityName?: string;
      facts?: {
        "us-gaap"?: Record<
          string,
          { units?: Record<string, Array<{ end: string; val: number; fy?: number }>> }
        >;
      };
    };

    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const res = await fetch(url, { headers: secHeaders(), next: { revalidate: 86400 } });
    if (!res.ok) {
      throw new Error(`SEC companyfacts failed: ${res.status}`);
    }
    const data = (await res.json()) as FactsPayload;
    const gaap = data.facts?.["us-gaap"] ?? {};
    const revenue =
      extractFact(gaap, "Revenues") ??
      extractFact(gaap, "RevenueFromContractWithCustomerExcludingAssessedTax");
    const operatingIncome = extractFact(gaap, "OperatingIncomeLoss");
    const netIncome = extractFact(gaap, "NetIncomeLoss") ?? extractFact(gaap, "ProfitLoss");
    const epsDiluted =
      extractFact(gaap, "EarningsPerShareDiluted") ?? extractFact(gaap, "EarningsPerShareBasic");
    const sharesOutstanding =
      extractFact(gaap, "CommonStockSharesOutstanding") ??
      extractFact(gaap, "EntityCommonStockSharesOutstanding");
    const totalAssets = extractFact(gaap, "Assets");
    const bookValueEquity = extractFact(gaap, "StockholdersEquity");
    const dividendsPerShare =
      extractFact(gaap, "CommonStockDividendsPerShareDeclared") ??
      extractFact(gaap, "DividendsPerShare");

    const fyFacts = gaap["Revenues"]?.units?.["USD"]?.find((x) => x.fy)?.fy;

    return {
      ticker: normalizeTicker(ticker),
      cik,
      entityName: data.entityName,
      fiscalYear: fyFacts,
      revenue,
      operatingIncome,
      netIncome,
      epsDiluted,
      sharesOutstanding,
      totalAssets,
      bookValueEquity,
      dividendsPerShare,
    };
  });
}
