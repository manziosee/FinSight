# FinSight Frontend

The FinSight workspace: a web app for finance teams to upload financial data, work the
reconciliation review queue, ask questions about their money and keep an audit trail. Built with
[TanStack Start](https://tanstack.com/start) (React 19, Vite, file-based routing, server routes),
Tailwind CSS 4 and shadcn/ui.

> **North star:** finance teams trust their books and know exactly where their money stands.
> **Metric:** payments matched to invoices and accepted each week.

## How it talks to the API

```
Browser ──same origin──▶ frontend server (Node, this app)                 ──▶ FinSight API gateway
         /api/session    · exchanges client credentials for a token
         /api/v1/*       · keeps it in an httpOnly, SameSite=Strict cookie
                         · proxies /api/v1/* → gateway /v1/*, adding the token
```

- **The browser never holds a token.** Sign-in sends the client ID and secret to this app's
  server ([src/server/finsight.server.ts](src/server/finsight.server.ts)), which calls the
  gateway's `POST /v1/auth/token` and sets the session cookie. JavaScript can't read it.
- **No CORS needed.** All calls are same-origin, which also lets the Content-Security-Policy say
  `connect-src 'self'`: injected script would have nowhere to send data.
- **CSRF:** the cookie is `SameSite=Strict`, and every proxied call must carry the
  `x-finsight-client: web` header (cross-site forms can't set it).
- An expired or revoked token makes the gateway answer 401; the proxy then clears the cookie
  and the UI returns to the sign-in state.

## Live data and sample data

Every workspace page has two versions:

|       | Signed in                                                             | Not signed in                       |
| ----- | --------------------------------------------------------------------- | ----------------------------------- |
| Data  | Your tenant's live data via the API (`src/components/finsight/live/`) | A clearly labelled sample workspace |
| Badge | **Live API**                                                          | **Sample data**                     |

Where the API doesn't offer something yet, the page says so with a note naming the missing
endpoint. The full list is in **[API-GAPS.md](API-GAPS.md)**.

| Page              | Live features                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home              | Reconciliation KPIs, open receivables by counterparty and currency, items needing attention, run reconciliation                                                |
| Sources & uploads | Upload CSV / JSON / Excel / PDF (≤ 50 MB) with source type; live normalization status, record counts, warnings                                                 |
| Reconciliation    | Run reconciliation, review queue, accept / reject / correct (keyboard A / R / J / K), bulk-accept ≥ 85 %, AI explanation per match, unmatched list, CSV export |
| Transactions      | Normalize a single transaction (classification, direction, counterparty, confidence)                                                                           |
| Counterparties    | Explore any entity in the financial graph; find paths between two entities                                                                                     |
| Ask FinSight      | Questions answered from your latest reconciliation, with evidence and a grounded/not-grounded badge                                                            |
| Anomalies         | Scan open invoices or a CSV for duplicate payments and unusual amounts                                                                                         |
| Forecast          | Cash projection from the forecast service with an inflow-adjustment scenario                                                                                   |
| Approvals         | Request catalogued actions (e.g. payment reminders) for maker-checker approval                                                                                 |
| Reports           | Reconciliation-run report as CSV or branded PDF                                                                                                                |
| Audit log         | Every state-changing API call in your tenant, searchable, exportable                                                                                           |
| Developers        | Live request explorer; create API keys scoped to your own permissions                                                                                          |
| Settings          | Your API client, tenant and scopes; display currency                                                                                                           |

## Run it

Requires [Bun](https://bun.sh) (or Node 22+ with npm) and a FinSight API to talk to.

```bash
bun install
FINSIGHT_API_URL=http://localhost:8088 bun run dev     # http://localhost:3500
```

Sign in with the local demo client: `demo-client` and the secret from the repo's `.env`
(`demo-secret` by default). Without signing in you get the sample workspace.

With the whole stack: `make up` from the repo root starts it at **http://localhost:3400**.

| Variable                  | Meaning                                      | Default                 |
| ------------------------- | -------------------------------------------- | ----------------------- |
| `FINSIGHT_API_URL`        | Gateway URL as seen from the frontend server | `http://localhost:8088` |
| `FINSIGHT_PUBLIC_API_URL` | Gateway URL shown to users (API docs links)  | `FINSIGHT_API_URL`      |
| `PORT`                    | Port of the production server                | `3000`                  |

Both are read at request time, so the same build works in every environment.

## Checks

```bash
bun run test          # Vitest: server session/proxy, API client, money, every live page
bun run lint          # ESLint + Prettier
npx tsc --noEmit      # strict TypeScript
bun run build         # production build → .output/server/index.mjs (Node)
```

## Deploy

- **Docker:** `docker build -t finsight/frontend .` — Bun build stage, Node runtime, non-root,
  production security headers (CSP, HSTS, frame-deny, nosniff).
- **Compose:** the `frontend` service in the repo's `docker-compose.yml` (port 3400).
- **Fly.io:** [fly.toml](fly.toml) — `fly apps create finsight-frontend && fly deploy --ha=false`.

## Project layout

```
src/routes/                    file-based routes (pages + server routes)
  api.session.ts               sign-in / session / sign-out
  api.v1.$.ts                  proxy to the gateway
  api.health.ts, api.healthz.ts  API status / this server's liveness
  app.*.tsx                    workspace pages (live + sample)
src/server/finsight.server.ts  session cookie, token exchange, proxy (server only)
src/lib/api.ts                 typed client for every endpoint
src/components/finsight/live/  live versions of the workspace pages
src/components/finsight/       session, layout kit, public site
src/components/ui/             shadcn/ui components
src/test/                      Vitest suites
```
