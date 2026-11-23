# Frontend roadmap

Done:

- [x] Every existing FinSight API endpoint integrated (live mode), with a labelled sample workspace for visitors.
- [x] Server-side session (httpOnly cookie) and same-origin API proxy; no tokens in the browser.
- [x] Node server build, Docker image, docker-compose service, Fly.io config; production security headers.
- [x] Tests for the server session/proxy, API client, money handling and every live page.

Next — each needs an API first (see API-GAPS.md):

- [ ] User accounts, roles and invitations (replace API-client sign-in for people).
- [ ] Transactions explorer with search, filters and saved views.
- [ ] Match detail with records, currency and signal breakdown in the review queue.
- [ ] Fee / write-off / split decisions and an approvals queue with approve/reject.
- [ ] Counterparty directory, stored anomalies with triage, cash/trend metrics, webhooks.

Frontend-only:

- [ ] French and Kinyarwanda translations.
- [ ] Column-mapping preview before upload (needs a preview endpoint).
