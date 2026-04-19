export type PortfolioItem = {
  ticker: string;
  note?: string;
  addedAt: string;
};

const KEY = "fair-value-portfolio-v1";

export function loadPortfolio(): PortfolioItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PortfolioItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePortfolio(items: PortfolioItem[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function upsertPortfolioItem(item: PortfolioItem) {
  const cur = loadPortfolio().filter((x) => x.ticker !== item.ticker);
  cur.unshift(item);
  savePortfolio(cur);
  return cur;
}

export function removePortfolioItem(ticker: string) {
  const cur = loadPortfolio().filter((x) => x.ticker !== ticker);
  savePortfolio(cur);
  return cur;
}
