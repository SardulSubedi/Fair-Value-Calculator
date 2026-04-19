# Fair-Value-Calculator

Program that uses a valuation method of your choice (and either uses AI or user inputted data) to calculate a fair value of a stock. Also includes a comparison tool to compare stocks against each other. Goal is to ultimately have a portfolio builder.

## App (Next.js)

The runnable application lives in [`web/`](web/).

Local development (from repo root):

```powershell
cd web
npm install
npm run dev
```

Configuration uses environment variables (see the project plan: free SEC `data.sec.gov` fundamentals for US tickers, optional free-tier enrichers, and your own AI keys via `.env.local`).

