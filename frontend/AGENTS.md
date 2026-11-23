# Frontend notes for contributors and agents

- Live data comes from the FinSight API through this app's own server: `src/server/finsight.server.ts`
  holds the session (httpOnly cookie) and proxies `/api/v1/*` to the gateway. Never call the gateway
  directly from the browser and never store a token client-side.
- Every page has a `Live*` component (`src/components/finsight/live/`) used when signed in, and keeps its
  sample-data version for visitors. Anything the API can't do yet is marked with `<ApiGap>` and listed in
  `API-GAPS.md` — keep the two in sync.

- Sample-workspace state lives in a shared React provider around the app layout, so page actions read back across navigation without pretending to persist or enforce access roles.
- Each workspace page has its own TanStack leaf route and head metadata, so navigation and sharing resolve to real pages.
- CSV import and export use Papa Parse, with formula-safe exports, so quoted financial records are handled reliably.
- The API session and display currency live in the root `SessionProvider`; sample-workspace records live in the app layout's `WorkspaceProvider`.
- Sign-out calls `DELETE /api/session` (clears the cookie), resets cached queries and replaces history with the sign-in page.
- Currency conversion uses pure illustrative-rate projections for UI and additive export columns; preserve canonical amounts, source evidence and historical match logic.
- Chunk-download failures offer a document reload from the root error boundary rather than retrying a stale module URL or automatically looping reloads.
- Notifications derive from active anomalies and pending approvals in the shared workspace state, so they link to actionable records rather than disconnected samples.
- PDF reports are generated client-side from a filtered report model using lazy-loaded pdf-lib, with the current logo, bundled font and CSS report tokens; prepare before a separate save action to preserve mobile download activation.
