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

Configuration (copy [`web/.env.example`](web/.env.example) to `web/.env.local`):

- `SEC_DATA_USER_AGENT` — required by SEC policy for `data.sec.gov` calls.
- `AI_API_KEY`, `AI_MODEL`, optional `AI_BASE_URL` — for `/api/ai/assumptions` (hybrid cited/inferred JSON).

API routes live under `web/src/app/api/` (`/api/market`, `/api/valuation/run`, `/api/valuation/auto-methods`, `/api/ai/assumptions`).

