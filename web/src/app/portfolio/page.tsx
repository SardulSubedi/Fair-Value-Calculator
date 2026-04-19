"use client";

import * as React from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loadPortfolio, removePortfolioItem, savePortfolio, type PortfolioItem } from "@/lib/portfolio/storage";

export default function PortfolioPage() {
  const [items, setItems] = React.useState<PortfolioItem[]>(() => loadPortfolio());
  const [ticker, setTicker] = React.useState("");

  const add = () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    const next: PortfolioItem[] = [{ ticker: t, addedAt: new Date().toISOString() }, ...items.filter((x) => x.ticker !== t)];
    savePortfolio(next);
    setItems(next);
    setTicker("");
  };

  const remove = (t: string) => {
    setItems(removePortfolioItem(t));
  };

  const aggregate = React.useMemo(() => {
    if (!items.length) return null;
    return {
      count: items.length,
      tickers: items.map((i) => i.ticker).join(", "),
    };
  }, [items]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio (MVP)</h1>
          <p className="text-muted-foreground text-sm">Stored locally in your browser (localStorage).</p>
        </div>
        <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Valuation
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add ticker</CardTitle>
          <CardDescription>Watchlist-style list for batch mental workflow (no auto-fetch yet).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="t">
              Symbol
            </label>
            <Input id="t" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="AAPL" />
          </div>
          <Button type="button" onClick={add}>
            Save
          </Button>
        </CardContent>
      </Card>

      {aggregate ? (
        <Card>
          <CardHeader>
            <CardTitle>Aggregate strip (placeholder)</CardTitle>
            <CardDescription>
              Holdings: {aggregate.count} — {aggregate.tickers}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Next step: batch-run saved valuations and chart consensus bands across the list. For now, use the main page per
            ticker.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Saved tickers</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {items.length === 0 ? (
            <div className="text-muted-foreground text-sm">No tickers yet.</div>
          ) : (
            items.map((i) => (
              <div key={i.ticker} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex flex-col">
                  <span className="font-medium">{i.ticker}</span>
                  <span className="text-muted-foreground text-xs">{i.addedAt}</span>
                </div>
                <div className="flex gap-2">
                  <Link href="/" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                    Open app
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => remove(i.ticker)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
