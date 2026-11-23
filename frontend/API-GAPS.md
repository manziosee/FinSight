# API gaps — what the frontend needs that the FinSight API doesn't offer yet

Every gap below is also marked in the UI with an `<ApiGap>` note naming the missing endpoint,
so the page tells users what isn't available instead of failing silently. Keep this file and
those notes in sync: when an endpoint ships, wire it in and delete its entry.

Status of the integration today: **all existing endpoints are integrated** (see the table at the
end). The gaps are features the backend doesn't have yet.

## Priority 1 — needed for day-to-day use

| Gap                          | Needed for                                                                     | Endpoint(s) to add                                                                                                                       | What the UI does meanwhile                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **User accounts & roles**    | Sign-in for people (not machine clients), registration, RBAC, team settings    | OIDC/password login for users, `POST /v1/users`, roles/permissions, invitations                                                          | Sign-in uses an API client (client ID + secret); "Get access" explains how clients are issued            |
| **Transactions list**        | Transactions page, transaction/exception/source reports, counterparty activity | `GET /v1/transactions?query=&status=&source=&currency=&from=&to=&cursor=`                                                                | Single-record "Understand a transaction" tool; reports cover reconciliation runs only                    |
| **Match detail**             | Reconciliation review (showing payment/invoice records side by side)           | `MatchOut` with the payment and invoice records, their **currency**, and the signal breakdown (amount / reference / counterparty / date) | Shows record IDs and amounts (without a currency) plus the explanation and exceptions                    |
| **Per-currency minor units** | Correct amounts everywhere                                                     | Store minor units with each currency's real decimals (RWF/UGX 0, USD 2, KWD 3)                                                           | `API_MINOR_UNIT_SCALE = 100` in `src/lib/money.ts` mirrors the backend's current ×100 for every currency |
| **List ingestions**          | Upload history across devices                                                  | `GET /v1/data/ingestions?cursor=`                                                                                                        | Upload IDs are remembered in the browser (per tenant) and polled by ID                                   |
| **List reconciliation runs** | Run history, picking an older run                                              | `GET /v1/reconciliation/runs`                                                                                                            | Uses the run started in this browser, else the latest from `/reconciliation/summary`                     |

## Priority 2 — review workflow and audit trail

| Gap                         | Needed for                                        | Endpoint(s) to add                                                                                                      | Meanwhile                                                              |
| --------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| More review decisions       | "Mark as fee", "Write off", split across invoices | `decision: fee \| write_off \| split` on `POST /v1/reconciliation/matches/{id}/review` (write-off routed to approvals)  | Buttons are shown disabled with a tooltip                              |
| Action requests & approvals | Approvals queue, maker-checker                    | `GET /v1/actions/requests`, `POST /v1/actions/{id}/approve`, `POST /v1/actions/{id}/reject`                             | Submitted requests are kept in the browser; approve/reject unavailable |
| API key management          | Developers page                                   | `GET /v1/api-keys`, `DELETE /v1/api-keys/{id}`, rotate                                                                  | Keys can be created (shown once) but not listed or revoked             |
| Counterparty directory      | Counterparties page                               | `GET /v1/counterparties` (balances, payment behaviour), merge/split                                                     | Entity lookup by ID and path finder over the graph                     |
| Stored anomalies            | Anomaly triage                                    | Detect on ingest (event-driven), `GET /v1/anomalies`, `PATCH /v1/anomalies/{id}` (investigating / resolved / dismissed) | On-demand scan of open invoices or a CSV; findings aren't stored       |

## Priority 3 — insight and platform

| Gap                               | Needed for                                            | Endpoint(s) to add                                                               | Meanwhile                                                                                   |
| --------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Cash & trend metrics              | Dashboard cash position and weekly charts             | `GET /v1/metrics/cash-position`, `GET /v1/metrics/trends`                        | Dashboard shows reconciliation KPIs and open receivables by counterparty                    |
| Real forecasting                  | Forecast page                                         | Forecast from actual balances, confidence bands; real `POST /v1/simulate`        | Forecast service's linear projection of the figures entered                                 |
| Reports API                       | Period, aging, exceptions reports; scheduled delivery | `GET /v1/reports/...`                                                            | Run report exported client-side (CSV/PDF)                                                   |
| Webhooks                          | Developers page                                       | Subscriptions, delivery log, signing secret                                      | Not shown                                                                                   |
| Organisation settings             | Settings page                                         | Org name, base currency, fiscal year, notification preferences                   | Display preferences only, per browser                                                       |
| Notifications                     | Header bell                                           | Notification feed (in-app/email)                                                 | Derived from the latest run (exceptions, unmatched)                                         |
| Rate limiting behind the frontend | Fair login throttling                                 | Gateway to trust the frontend's forwarded client IP (or per-client login limits) | All sign-ins through one frontend share the frontend server's IP for the 20/min token limit |

## Endpoints integrated today

| Endpoint                                                                                                                                           | Where                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `POST /v1/auth/token`                                                                                                                              | Sign in (server-side, `src/server/finsight.server.ts`)                   |
| `POST /v1/data/upload`, `GET /v1/data/ingestions/{id}`                                                                                             | Sources & uploads (upload, live status polling)                          |
| `POST /v1/reconciliation/run`, `GET /v1/reconciliation/{id}`, `GET /v1/reconciliation/{id}/matches`, `POST /v1/reconciliation/matches/{id}/review` | Reconciliation (run, queue, accept/reject/correct, bulk accept), Reports |
| `GET /v1/reconciliation/summary`                                                                                                                   | Home, notifications, anomaly scan, latest run                            |
| `GET /v1/reconciliation/weights`                                                                                                                   | Developers explorer                                                      |
| `POST /v1/transactions/explain`, `POST /v1/financial/ask`                                                                                          | Reconciliation ("Explain with AI"), Ask FinSight                         |
| `POST /v1/transactions/understand`                                                                                                                 | Transactions                                                             |
| `GET /v1/graph/entities/{id}`, `GET /v1/graph/paths`                                                                                               | Counterparties                                                           |
| `POST /v1/anomalies/detect`                                                                                                                        | Anomalies                                                                |
| `POST /v1/forecast`                                                                                                                                | Forecast                                                                 |
| `GET /v1/actions/catalog`, `POST /v1/actions/execute`                                                                                              | Approvals                                                                |
| `GET /v1/audit`                                                                                                                                    | Audit log                                                                |
| `POST /v1/api-keys`                                                                                                                                | Developers                                                               |
| `GET /health`                                                                                                                                      | API status in the sidebar                                                |

Not used by the UI: `POST /v1/data/ingest` (JSON ingestion — for integrations), `POST /v1/payments/match`
(single-pair scoring), `POST /v1/anomalies/explain` and `POST /v1/simulate` (scaffold responses only).
