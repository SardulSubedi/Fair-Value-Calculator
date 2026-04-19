"use client";

import * as React from "react";
import Link from "next/link";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { upsertPortfolioItem } from "@/lib/portfolio/storage";
import { cn } from "@/lib/utils";

type Market = {
  ticker: string;
  lastPrice?: number;
  fundamentals?: {
    epsDiluted?: number;
    sharesOutstanding?: number;
    revenue?: number;
    operatingIncome?: number;
    netIncome?: number;
    entityName?: string;
    bookValueEquity?: number;
  };
  dataCompleteness: number;
  messages: string[];
  dataSources?: string[];
};

type MethodResult = {
  methodId: string;
  label: string;
  fairValuePerShare: number | null;
  skipped?: boolean;
  skipReason?: string;
  trace: { steps: Array<{ label: string; value: string; formula?: string; detail?: string }> };
  warnings: string[];
};

type RunOutput = {
  ticker: string;
  market: Market;
  results: MethodResult[];
  weights: Record<string, number>;
  consensus: number | null;
  diagnostics: unknown[];
  disagreement: { min: number; max: number; median: number; spreadPct: number | null } | null;
  monteCarlo: {
    n: number;
    p05: number | null;
    p25: number | null;
    p50: number | null;
    p75: number | null;
    p95: number | null;
    histogram: { label: string; count: number }[];
  } | null;
  coupling: Array<{ field: string; message: string; severity: string }>;
  tornado?: Array<{
    driver: string;
    fairLow: number | null;
    fairBase: number | null;
    fairHigh: number | null;
  }> | null;
  evidenceProvenance?: string[];
  evidenceCompleteness?: number;
};

type RunExtras = {
  compareMcOverlap?: { overlap: boolean; note: string } | null;
  evidenceSymmetry?: { a: number; b: number | null; note: string | null };
};

const defaultDcf = {
  fcf0: 1_000_000_000,
  explicitYears: 5,
  fcfGrowthExplicit: 0.05,
  terminalGrowth: 0.02,
  wacc: 0.09,
  netDebt: 80_000_000_000,
  cashAndEquivalents: 60_000_000_000,
  sharesOutstanding: 16_000_000_000,
};

type EvInputs = {
  ebitda: number;
  evEbitdaMultiple: number;
  netDebt: number;
  cash: number;
  sharesOutstanding: number;
};

export function ValuationWorkspace() {
  const [mode, setMode] = React.useState<"one" | "compare">("one");
  const [tA, setTA] = React.useState("AAPL");
  const [tB, setTB] = React.useState("MSFT");
  const [lastA, setLastA] = React.useState<string>("");
  const [lastB, setLastB] = React.useState<string>("");
  const [methods, setMethods] = React.useState<string[]>(["dcf_fcff", "multiples_pe", "multiples_ev_ebitda"]);
  const [style, setStyle] = React.useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [complexity, setComplexity] = React.useState<"few" | "many">("few");
  const [emphasis, setEmphasis] = React.useState<"income" | "growth" | "assets" | "balanced">("balanced");

  const [dcfA, setDcfA] = React.useState(defaultDcf);
  const [dcfB, setDcfB] = React.useState(defaultDcf);
  const [peA, setPeA] = React.useState({ eps: 6.2, peMultiple: 28 });
  const [peB, setPeB] = React.useState({ eps: 10, peMultiple: 30 });
  const [evA, setEvA] = React.useState<EvInputs>({
    ebitda: 130_000_000_000,
    evEbitdaMultiple: 18,
    netDebt: 80_000_000_000,
    cash: 60_000_000_000,
    sharesOutstanding: 16_000_000_000,
  });
  const [evB, setEvB] = React.useState<EvInputs>({
    ebitda: 100_000_000_000,
    evEbitdaMultiple: 20,
    netDebt: 50_000_000_000,
    cash: 75_000_000_000,
    sharesOutstanding: 7_500_000_000,
  });

  const [pbA, setPbA] = React.useState({ bookValuePerShare: 4, pbMultiple: 10 });
  const [pbB, setPbB] = React.useState({ bookValuePerShare: 5, pbMultiple: 12 });
  const [psA, setPsA] = React.useState({ revenuePerShare: 25, psMultiple: 8 });
  const [psB, setPsB] = React.useState({ revenuePerShare: 18, psMultiple: 9 });

  const [includeTornado, setIncludeTornado] = React.useState(true);
  const [useCustomWeights, setUseCustomWeights] = React.useState(false);
  const [wDcf, setWDcf] = React.useState("40");
  const [wPe, setWPe] = React.useState("30");
  const [wEv, setWEv] = React.useState("30");

  const [mcEnabled, setMcEnabled] = React.useState(false);
  const [mcWaccMin, setMcWaccMin] = React.useState("0.08");
  const [mcWaccMax, setMcWaccMax] = React.useState("0.11");

  const [marketA, setMarketA] = React.useState<Market | null>(null);
  const [marketB, setMarketB] = React.useState<Market | null>(null);
  const [outputs, setOutputs] = React.useState<RunOutput[] | null>(null);
  const [runExtras, setRunExtras] = React.useState<RunExtras | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [aiNote, setAiNote] = React.useState<string | null>(null);

  const refreshMarket = React.useCallback(async () => {
    setError(null);
    const qs = (t: string, last: string) => {
      const p = new URLSearchParams({ ticker: t });
      if (last) p.set("lastPrice", last);
      return p.toString();
    };
    const [a, b] = await Promise.all([
      fetch(`/api/market?${qs(tA, lastA)}`).then((r) => r.json()),
      mode === "compare" ? fetch(`/api/market?${qs(tB, lastB)}`).then((r) => r.json()) : Promise.resolve(null),
    ]);
    if (!a.ok) throw new Error(a.error ?? "Market A failed");
    setMarketA(a.market);
    if (b) {
      if (!b.ok) throw new Error(b.error ?? "Market B failed");
      setMarketB(b.market);
    } else {
      setMarketB(null);
    }
    const fA = a.market?.fundamentals;
    if (fA?.epsDiluted) setPeA((p) => ({ ...p, eps: fA.epsDiluted! }));
    if (fA?.sharesOutstanding) setDcfA((d) => ({ ...d, sharesOutstanding: fA.sharesOutstanding! }));
    if (fA?.sharesOutstanding) setEvA((e) => ({ ...e, sharesOutstanding: fA.sharesOutstanding! }));
    if (fA?.bookValueEquity && fA.sharesOutstanding) {
      setPbA((p) => ({ ...p, bookValuePerShare: fA.bookValueEquity! / fA.sharesOutstanding! }));
    }
    if (fA?.revenue && fA.sharesOutstanding) {
      setPsA((p) => ({ ...p, revenuePerShare: fA.revenue! / fA.sharesOutstanding! }));
    }
    if (mode === "compare" && b?.market?.fundamentals) {
      const fB = b.market.fundamentals;
      if (fB.epsDiluted != null) setPeB((p) => ({ ...p, eps: fB.epsDiluted as number }));
      if (fB.sharesOutstanding) {
        setDcfB((d) => ({ ...d, sharesOutstanding: fB.sharesOutstanding! }));
        setEvB((e) => ({ ...e, sharesOutstanding: fB.sharesOutstanding! }));
      }
      if (fB.bookValueEquity && fB.sharesOutstanding) {
        setPbB((p) => ({ ...p, bookValuePerShare: fB.bookValueEquity / fB.sharesOutstanding }));
      }
      if (fB.revenue && fB.sharesOutstanding) {
        setPsB((p) => ({ ...p, revenuePerShare: fB.revenue / fB.sharesOutstanding }));
      }
    }
  }, [tA, tB, lastA, lastB, mode]);

  const run = async () => {
    setLoading(true);
    setError(null);
    setOutputs(null);
    setRunExtras(null);
    try {
      const tickers = mode === "compare" ? [tA, tB] : [tA];
      const lastPrices = mode === "compare" ? [num(lastA), num(lastB)] : [num(lastA)];
      const assumptionsByTicker: Record<string, object> = {
        [tA.toUpperCase()]: {
          dcf_fcff: dcfA,
          multiples_pe: peA,
          multiples_ev_ebitda: evA,
          multiples_pb: pbA,
          multiples_ps: psA,
        },
      };
      if (mode === "compare") {
        assumptionsByTicker[tB.toUpperCase()] = {
          dcf_fcff: dcfB,
          multiples_pe: peB,
          multiples_ev_ebitda: evB,
          multiples_pb: pbB,
          multiples_ps: psB,
        };
      }
      let ensembleOverrides: Record<string, number> | undefined;
      if (useCustomWeights) {
        const a = Number(wDcf) / 100;
        const b = Number(wPe) / 100;
        const c = Number(wEv) / 100;
        ensembleOverrides = {};
        if (methods.includes("dcf_fcff")) ensembleOverrides.dcf_fcff = a;
        if (methods.includes("multiples_pe")) ensembleOverrides.multiples_pe = b;
        if (methods.includes("multiples_ev_ebitda")) ensembleOverrides.multiples_ev_ebitda = c;
      }
      const body = {
        mode,
        tickers,
        methods,
        lastPrices,
        assumptionsByTicker,
        preferences: { style, complexity, emphasis, allowAiInference: true },
        monteCarlo: mcEnabled
          ? {
              enabled: true,
              samples: 1200,
              seed: 7,
              dcf: {
                wacc: { min: Number(mcWaccMin), max: Number(mcWaccMax) },
              },
            }
          : undefined,
        ensembleOverrides,
        includeTornado,
      };
      const res = await fetch("/api/valuation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Run failed");
      setOutputs(json.outputs as RunOutput[]);
      setRunExtras({
        compareMcOverlap: json.compareMcOverlap ?? null,
        evidenceSymmetry: json.evidenceSymmetry,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const autoPick = async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshMarket();
      const res = await fetch("/api/valuation/auto-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: tA,
          lastPrice: num(lastA),
          preferences: { style, complexity, emphasis, allowAiInference: true },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Auto methods failed");
      setMethods(json.methods);
      setAiNote(`Auto-selected ${json.methods.length} methods using deterministic policy + preferences.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const aiSuggest = async () => {
    setLoading(true);
    setError(null);
    setAiNote(null);
    try {
      const res = await fetch("/api/ai/assumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: tA }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "AI route failed");
      if (json.proposal?.error) {
        setAiNote(json.proposal.error);
        return;
      }
      const p = json.proposal;
      setAiNote(`AI proposal (${p.model ?? "unknown"}): ${JSON.stringify(p, null, 2)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const toggleMethod = (id: string) => {
    setMethods((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  };

  const chartData =
    outputs?.flatMap((o) =>
      o.results
        .filter((r) => typeof r.fairValuePerShare === "number")
        .map((r) => ({
          name: `${o.ticker} ${r.label}`,
          value: Number(r.fairValuePerShare!.toFixed(2)),
        })),
    ) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fair Value Calculator</h1>
          <p className="text-muted-foreground text-sm">
            Intrinsic + relative methods, SEC fundamentals (US), optional Monte Carlo, compare mode.
          </p>
        </div>
        <Link href="/portfolio" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Portfolio
        </Link>
      </header>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "one" | "compare")}>
        <TabsList>
          <TabsTrigger value="one">One stock</TabsTrigger>
          <TabsTrigger value="compare">Compare two</TabsTrigger>
        </TabsList>
        <TabsContent value="one" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Ticker</CardTitle>
              <CardDescription>US tickers use SEC company facts when available.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="tA">Symbol</Label>
                <Input id="tA" value={tA} onChange={(e) => setTA(e.target.value)} />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="lastA">Last price (optional)</Label>
                <Input id="lastA" value={lastA} onChange={(e) => setLastA(e.target.value)} placeholder="e.g. 210" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="compare" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Two tickers</CardTitle>
              <CardDescription>Runs the same method set on both names.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Symbol A</Label>
                <Input value={tA} onChange={(e) => setTA(e.target.value)} />
                <Label>Last A</Label>
                <Input value={lastA} onChange={(e) => setLastA(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Symbol B</Label>
                <Input value={tB} onChange={(e) => setTB(e.target.value)} />
                <Label>Last B</Label>
                <Input value={lastB} onChange={(e) => setLastB(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Used for auto method selection and ensemble weighting.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label>Style</Label>
            <Select value={style} onValueChange={(v) => setStyle(v as typeof style)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Method breadth</Label>
            <Select value={complexity} onValueChange={(v) => setComplexity(v as typeof complexity)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="few">Few (faster)</SelectItem>
                <SelectItem value="many">Many (more disagreement)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Emphasis</Label>
            <Select value={emphasis} onValueChange={(v) => setEmphasis(v as typeof emphasis)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="assets">Assets</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Methods</CardTitle>
          <CardDescription>Toggle engines for this run.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {["dcf_fcff", "multiples_pe", "multiples_ev_ebitda", "multiples_pb", "multiples_ps"].map((id) => (
            <Button key={id} variant={methods.includes(id) ? "default" : "outline"} size="sm" onClick={() => toggleMethod(id)}>
              {id}
            </Button>
          ))}
          <Separator orientation="vertical" className="mx-2 hidden h-8 sm:inline-flex" />
          <Button size="sm" variant="secondary" onClick={autoPick} disabled={loading}>
            Auto-pick methods
          </Button>
          <Button size="sm" variant="ghost" onClick={aiSuggest} disabled={loading}>
            AI assumption draft (ticker A)
          </Button>
          <Button size="sm" variant="outline" onClick={refreshMarket} disabled={loading}>
            Refresh SEC facts
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <AssumptionCard
          title={`Assumptions — ${tA.toUpperCase()}`}
          dcf={dcfA}
          setDcf={setDcfA}
          pe={peA}
          setPe={setPeA}
          ev={evA}
          setEv={setEvA}
          pb={pbA}
          setPb={setPbA}
          ps={psA}
          setPs={setPsA}
          market={marketA}
        />
        {mode === "compare" ? (
          <AssumptionCard
            title={`Assumptions — ${tB.toUpperCase()}`}
            dcf={dcfB}
            setDcf={setDcfB}
            pe={peB}
            setPe={setPeB}
            ev={evB}
            setEv={setEvB}
            pb={pbB}
            setPb={setPbB}
            ps={psB}
            setPs={setPsB}
            market={marketB}
          />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sensitivity & ensemble</CardTitle>
          <CardDescription>Tornado chart (DCF drivers) and optional custom method weights.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeTornado} onChange={(e) => setIncludeTornado(e.target.checked)} />
            Include DCF tornado (one-at-a-time driver bumps)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useCustomWeights} onChange={(e) => setUseCustomWeights(e.target.checked)} />
            Custom ensemble weights (DCF / P/E / EV-EBITDA only; renormalized server-side)
          </label>
          {useCustomWeights ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="DCF weight %" value={wDcf} onChange={setWDcf} />
              <Field label="P/E weight %" value={wPe} onChange={setWPe} />
              <Field label="EV/EBITDA weight %" value={wEv} onChange={setWEv} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monte Carlo (DCF only)</CardTitle>
          <CardDescription>Uniform bands on WACC (extend later).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mcEnabled} onChange={(e) => setMcEnabled(e.target.checked)} />
            Enable
          </label>
          <div className="flex flex-col gap-2">
            <Label>WACC min</Label>
            <Input value={mcWaccMin} onChange={(e) => setMcWaccMin(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>WACC max</Label>
            <Input value={mcWaccMax} onChange={(e) => setMcWaccMax(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={run} disabled={loading}>
          {loading ? "Running…" : "Run valuation"}
        </Button>
        {mode === "one" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              upsertPortfolioItem({ ticker: tA.toUpperCase(), addedAt: new Date().toISOString() });
            }}
          >
            Save ticker to portfolio
          </Button>
        ) : null}
      </div>

      {error ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {aiNote ? (
        <Card>
          <CardHeader>
            <CardTitle>AI / Auto notes</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap">{aiNote}</pre>
          </CardContent>
        </Card>
      ) : null}

      {outputs ? <Results outputs={outputs} chartData={chartData} extras={runExtras} /> : null}

      <p className="text-muted-foreground max-w-3xl text-xs leading-relaxed">
        Not investment advice. Models are simplified teaching implementations—verify all inputs, read primary filings,
        and consult a licensed professional before making investment decisions.
      </p>
    </div>
  );
}

function num(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function AssumptionCard(props: {
  title: string;
  dcf: typeof defaultDcf;
  setDcf: React.Dispatch<React.SetStateAction<typeof defaultDcf>>;
  pe: { eps: number; peMultiple: number };
  setPe: React.Dispatch<React.SetStateAction<{ eps: number; peMultiple: number }>>;
  ev: EvInputs;
  setEv: React.Dispatch<React.SetStateAction<EvInputs>>;
  pb: { bookValuePerShare: number; pbMultiple: number };
  setPb: React.Dispatch<React.SetStateAction<{ bookValuePerShare: number; pbMultiple: number }>>;
  ps: { revenuePerShare: number; psMultiple: number };
  setPs: React.Dispatch<React.SetStateAction<{ revenuePerShare: number; psMultiple: number }>>;
  market: Market | null;
}) {
  const { title, dcf, setDcf, pe, setPe, ev, setEv, pb, setPb, ps, setPs, market } = props;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {market ? (
          <CardDescription>
            Data completeness: {(market.dataCompleteness * 100).toFixed(0)}% ·{" "}
            {market.fundamentals?.entityName ?? "Unknown entity"}
            {market.dataSources?.length ? (
              <>
                {" "}
                · Sources: {market.dataSources.join(", ")}
              </>
            ) : null}
          </CardDescription>
        ) : (
          <CardDescription>Fetch SEC facts to prefill where possible.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="FCF year 0" value={String(dcf.fcf0)} onChange={(v) => setDcf((d) => ({ ...d, fcf0: Number(v) || 0 }))} />
          <Field label="Explicit years" value={String(dcf.explicitYears)} onChange={(v) => setDcf((d) => ({ ...d, explicitYears: Number(v) || 5 }))} />
          <Field label="FCF growth (explicit)" value={String(dcf.fcfGrowthExplicit)} onChange={(v) => setDcf((d) => ({ ...d, fcfGrowthExplicit: Number(v) || 0 }))} />
          <Field label="Terminal growth" value={String(dcf.terminalGrowth)} onChange={(v) => setDcf((d) => ({ ...d, terminalGrowth: Number(v) || 0 }))} />
          <Field label="WACC" value={String(dcf.wacc)} onChange={(v) => setDcf((d) => ({ ...d, wacc: Number(v) || 0 }))} />
          <Field label="Net debt" value={String(dcf.netDebt)} onChange={(v) => setDcf((d) => ({ ...d, netDebt: Number(v) || 0 }))} />
          <Field label="Cash" value={String(dcf.cashAndEquivalents)} onChange={(v) => setDcf((d) => ({ ...d, cashAndEquivalents: Number(v) || 0 }))} />
          <Field label="Shares" value={String(dcf.sharesOutstanding)} onChange={(v) => setDcf((d) => ({ ...d, sharesOutstanding: Number(v) || 1 }))} />
        </div>
        <Separator />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="EPS (P/E)" value={String(pe.eps)} onChange={(v) => setPe((p) => ({ ...p, eps: Number(v) || 0 }))} />
          <Field label="P/E multiple" value={String(pe.peMultiple)} onChange={(v) => setPe((p) => ({ ...p, peMultiple: Number(v) || 1 }))} />
        </div>
        <Separator />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="EBITDA" value={String(ev.ebitda)} onChange={(v) => setEv((e) => ({ ...e, ebitda: Number(v) || 0 }))} />
          <Field label="EV/EBITDA" value={String(ev.evEbitdaMultiple)} onChange={(v) => setEv((e) => ({ ...e, evEbitdaMultiple: Number(v) || 1 }))} />
          <Field label="EV net debt" value={String(ev.netDebt)} onChange={(v) => setEv((e) => ({ ...e, netDebt: Number(v) || 0 }))} />
          <Field label="EV cash" value={String(ev.cash)} onChange={(v) => setEv((e) => ({ ...e, cash: Number(v) || 0 }))} />
          <Field label="EV shares" value={String(ev.sharesOutstanding)} onChange={(v) => setEv((e) => ({ ...e, sharesOutstanding: Number(v) || 1 }))} />
        </div>
        <Separator />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Book value / share (P/B)"
            value={String(pb.bookValuePerShare)}
            onChange={(v) => setPb((p) => ({ ...p, bookValuePerShare: Number(v) || 0 }))}
          />
          <Field
            label="P/B multiple"
            value={String(pb.pbMultiple)}
            onChange={(v) => setPb((p) => ({ ...p, pbMultiple: Number(v) || 1 }))}
          />
        </div>
        <Separator />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Revenue / share (P/S)"
            value={String(ps.revenuePerShare)}
            onChange={(v) => setPs((p) => ({ ...p, revenuePerShare: Number(v) || 0 }))}
          />
          <Field
            label="P/S multiple"
            value={String(ps.psMultiple)}
            onChange={(v) => setPs((p) => ({ ...p, psMultiple: Number(v) || 1 }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">{props.label}</Label>
      <Input value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

function Results({
  outputs,
  chartData,
  extras,
}: {
  outputs: RunOutput[];
  chartData: { name: string; value: number }[];
  extras: RunExtras | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {outputs.length === 2 && extras?.evidenceSymmetry ? (
        <Card>
          <CardHeader>
            <CardTitle>Evidence symmetry</CardTitle>
            <CardDescription>{extras.evidenceSymmetry.note}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            Ticker A completeness: {(extras.evidenceSymmetry.a * 100).toFixed(0)}%
            {extras.evidenceSymmetry.b != null ? (
              <>
                {" "}
                · Ticker B: {(extras.evidenceSymmetry.b * 100).toFixed(0)}%
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {outputs.length === 2 && extras?.compareMcOverlap ? (
        <Card>
          <CardHeader>
            <CardTitle>Monte Carlo overlap (compare)</CardTitle>
            <CardDescription>DCF simulation IQR overlap when MC is enabled for both.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Badge variant={extras.compareMcOverlap.overlap ? "default" : "secondary"}>
              {extras.compareMcOverlap.overlap ? "Overlap" : "No overlap"}
            </Badge>
            <p className="text-muted-foreground mt-2">{extras.compareMcOverlap.note}</p>
          </CardContent>
        </Card>
      ) : null}

      {outputs.map((o) => (
        <Card key={o.ticker}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{o.ticker}</CardTitle>
              <CardDescription>
                Consensus (weighted):{" "}
                <span className="text-foreground font-medium">
                  {o.consensus == null ? "—" : `$${o.consensus.toFixed(2)}`}
                </span>
                {o.market.lastPrice ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · Last: ${o.market.lastPrice.toFixed(2)} · MoS:{" "}
                    {o.consensus == null
                      ? "—"
                      : `${(((o.consensus - o.market.lastPrice) / o.market.lastPrice) * 100).toFixed(1)}%`}
                  </span>
                ) : null}
              </CardDescription>
            </div>
            <Badge variant="secondary">Completeness {(o.market.dataCompleteness * 100).toFixed(0)}%</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {o.evidenceProvenance?.length ? (
              <div className="text-muted-foreground text-xs">
                Evidence provenance: {o.evidenceProvenance.join(" · ")}
              </div>
            ) : null}
            {o.tornado?.length ? (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">DCF tornado (fair value per share)</div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="p-2 font-medium">Driver</th>
                        <th className="p-2 font-medium">Low</th>
                        <th className="p-2 font-medium">Base</th>
                        <th className="p-2 font-medium">High</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.tornado.map((row) => (
                        <tr key={row.driver} className="border-b last:border-0">
                          <td className="p-2">{row.driver}</td>
                          <td className="p-2">{fmt(row.fairLow)}</td>
                          <td className="p-2">{fmt(row.fairBase)}</td>
                          <td className="p-2">{fmt(row.fairHigh)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {o.coupling?.length ? (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Coupling checks</div>
                <ul className="text-muted-foreground list-disc pl-5 text-sm">
                  {o.coupling.map((c) => (
                    <li key={c.field + c.message}>
                      <span className="text-foreground">{c.field}</span>: {c.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {o.monteCarlo ? (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">DCF Monte Carlo ({o.monteCarlo.n} samples)</div>
                <div className="text-muted-foreground text-sm">
                  p05 {fmt(o.monteCarlo.p05)} · p25 {fmt(o.monteCarlo.p25)} · p50 {fmt(o.monteCarlo.p50)} · p75{" "}
                  {fmt(o.monteCarlo.p75)} · p95 {fmt(o.monteCarlo.p95)}
                </div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={o.monteCarlo.histogram}>
                      <XAxis dataKey="label" hide />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={4} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {o.results.map((r) => (
                <Card key={r.methodId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{r.label}</CardTitle>
                    <CardDescription>
                      {r.skipped ? r.skipReason : `$${r.fairValuePerShare?.toFixed(2) ?? "—"}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {r.warnings.map((w) => (
                      <div key={w} className="text-destructive text-xs">
                        {w}
                      </div>
                    ))}
                    <Dialog>
                      <DialogTrigger>
                        <Button size="sm" variant="outline">
                          Show calculations
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>
                            {o.ticker} · {r.label}
                          </DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh] pr-3">
                          <div className="flex flex-col gap-3 text-sm">
                            {r.trace.steps.map((s, idx) => (
                              <div key={idx} className="rounded-md border p-3">
                                <div className="font-medium">{s.label}</div>
                                <div className="text-muted-foreground">{s.value}</div>
                                {s.formula ? <div className="text-xs">Formula: {s.formula}</div> : null}
                                {s.detail ? <div className="text-xs">{s.detail}</div> : null}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {chartData.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Method comparison</CardTitle>
            <CardDescription>Point estimates across methods{outputs.length > 1 ? " (all tickers)" : ""}.</CardDescription>
          </CardHeader>
          <CardContent className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={90} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      {outputs.length === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Compare takeaway</CardTitle>
            <CardDescription>Based on weighted consensus vs last price when provided.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <CompareSummary a={outputs[0]!} b={outputs[1]!} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function fmt(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function CompareSummary({ a, b }: { a: RunOutput; b: RunOutput }) {
  const ca = a.consensus;
  const cb = b.consensus;
  const pa = a.market.lastPrice;
  const pb = b.market.lastPrice;
  if (ca == null || cb == null) return <div>Consensus unavailable for one or both tickers.</div>;
  const undA = pa ? ca - pa : null;
  const undB = pb ? cb - pb : null;
  let line = "";
  if (undA != null && undB != null) {
    line =
      undA / pa! > undB / pb!
        ? `${a.ticker} shows higher margin-of-safety vs last price (naive).`
        : `${b.ticker} shows higher margin-of-safety vs last price (naive).`;
  } else {
    line = "Add last prices to compare naive undervaluation vs market.";
  }
  return (
    <div className="flex flex-col gap-2">
      <div>
        {a.ticker}: consensus {fmt(ca)}
        {pa ? `, last ${fmt(pa)}, MoS ${(((ca - pa) / pa) * 100).toFixed(1)}%` : ""}
      </div>
      <div>
        {b.ticker}: consensus {fmt(cb)}
        {pb ? `, last ${fmt(pb)}, MoS ${(((cb - pb) / pb) * 100).toFixed(1)}%` : ""}
      </div>
      <Separator />
      <div className="text-muted-foreground">{line}</div>
      <div className="text-muted-foreground text-xs">
        Different capital structures, cycles, and accounting choices are not fully normalized here—treat as a first pass.
      </div>
    </div>
  );
}
