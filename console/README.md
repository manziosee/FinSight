# FinSight Console

A thin reference UI for the FinSight API — proof that the API is actually usable, not a
product surface in its own right. Next.js (App Router), TypeScript, no UI framework: it
calls the gateway directly from the browser with `fetch`, nothing more.

## What it does

| Page | Calls | Purpose |
|---|---|---|
| `/` (Connect) | `POST /v1/auth/token` | OAuth2 client-credentials login, token kept in `localStorage` |
| `/upload` | `POST /v1/data/upload` | Push a CSV/JSON/Excel/PDF batch into ingestion |
| `/reconciliation` | `POST /v1/reconciliation/run`, `POST /v1/reconciliation/matches/{id}/review`, `POST /v1/transactions/explain` | Run matching, work the review queue (accept/reject), ask for an evidence-grounded explanation of any match |
| `/ask` | `POST /v1/financial/ask` | Free-text questions, answered from a live reconciliation summary |
| `/audit` | `GET /v1/audit` | The audit trail every mutating call above produces |

There is no backend of its own and no server-side data fetching — every API call is a
client-side `fetch` from `lib/api.ts` straight to `NEXT_PUBLIC_FINSIGHT_API_URL` (the
gateway), which is why `output: "standalone"` + a Node runtime is enough; nothing needs a
database connection or secrets on the server side.

## Local development

```bash
cp .env.local.example .env.local   # points at http://localhost:8088 by default
npm install
npm run dev
```

Requires the FinSight stack running (`make up` from the repo root) and the seeded demo
client (`demo-client` / `demo-secret`).

## Checks

```bash
npm run typecheck   # tsc --noEmit
npx eslint .
npm run build
```

## Docker

```bash
docker build -t finsight/console . \
  --build-arg NEXT_PUBLIC_FINSIGHT_API_URL=https://api.finsight.example
docker run -p 3000:3000 finsight/console
```

`NEXT_PUBLIC_*` variables are inlined into the client bundle at **build** time (Next.js
convention) — set `NEXT_PUBLIC_FINSIGHT_API_URL` as a build arg, not a runtime env var, if
you rebuild the image per environment. Also part of `docker-compose.yml` (`console`
service, port 3300) and `deploy/fly/console.toml`.
