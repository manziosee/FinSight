/** Turns the gateway's OpenAPI spec into the endpoint list shown on the public Developers page. */

export type OpenApiOperation = {
    tags?: string[];
    summary?: string;
    description?: string;
    security?: unknown[];
};

export type OpenApiSpec = {
    info?: { title?: string; version?: string; description?: string };
    paths?: Record<string, Record<string, OpenApiOperation | unknown>>;
};

export type Endpoint = {
    method: string;
    path: string;
    summary: string;
    description: string;
    /** Scope the caller's token needs; null for public endpoints. */
    scope: string | null;
    public: boolean;
};

export type EndpointGroup = { tag: string; title: string; endpoints: Endpoint[] };

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Required scope per operation. The gateway spec doesn't carry scopes, so this mirrors the
 * require_scopes(...) dependency on each route; keep it in sync when routes change. */
export const ENDPOINT_SCOPES: Record<string, string> = {
    "POST /v1/api-keys": "api-keys:write",
    "GET /v1/audit": "audit:read",
    "GET /v1/members": "members:manage",
    "POST /v1/members": "members:manage",
    "PATCH /v1/members/{client_id}": "members:manage",
    "POST /v1/members/{client_id}/reset-secret": "members:manage",
    "DELETE /v1/members/{client_id}": "members:manage",
    "POST /v1/data/ingest": "data:write",
    "POST /v1/data/upload": "data:write",
    "GET /v1/data/ingestions/{ingestion_id}": "data:write",
    "POST /v1/transactions/understand": "transactions:read",
    "GET /v1/graph/entities/{entity_id}": "graph:read",
    "GET /v1/graph/paths": "graph:read",
    "POST /v1/reconciliation/run": "reconciliation:run",
    "GET /v1/reconciliation/{run_id}/matches": "reconciliation:read",
    "POST /v1/reconciliation/matches/{match_id}/review": "reconciliation:run",
    "GET /v1/reconciliation/weights": "reconciliation:read",
    "GET /v1/reconciliation/summary": "reconciliation:read",
    "GET /v1/reconciliation/{run_id}": "reconciliation:read",
    "POST /v1/payments/match": "payments:match",
    "POST /v1/transactions/explain": "transactions:read",
    "POST /v1/financial/ask": "financial:ask",
    "POST /v1/anomalies/detect": "anomalies:read",
    "POST /v1/anomalies/explain": "anomalies:read",
    "POST /v1/forecast": "forecast:run",
    "POST /v1/simulate": "forecast:run",
    "GET /v1/actions/catalog": "actions:execute",
    "POST /v1/actions/execute": "actions:execute",
};

/** Plain-language description per operation (the generated summaries are terse: "Jwks"). */
export const ENDPOINT_DOCS: Record<string, string> = {
    "POST /v1/auth/token": "Exchange a client ID and secret for a short-lived access token.",
    "GET /.well-known/jwks.json": "Public keys for verifying FinSight access tokens.",
    "POST /v1/api-keys": "Create a scoped API key for a server or integration.",
    "GET /v1/audit": "Every action taken in your workspace, newest first.",
    "GET /v1/members": "People who can sign in to your workspace and their roles.",
    "POST /v1/members": "Add a person; their sign-in secret is returned once.",
    "PATCH /v1/members/{client_id}": "Change someone's role, or suspend and restore access.",
    "POST /v1/members/{client_id}/reset-secret": "Issue a new sign-in secret for someone.",
    "DELETE /v1/members/{client_id}": "Remove a person from the workspace.",
    "POST /v1/data/ingest": "Send records as JSON for normalization.",
    "POST /v1/data/upload": "Upload a bank statement, invoice export or ledger file.",
    "GET /v1/data/ingestions/{ingestion_id}": "Check the progress of an upload.",
    "POST /v1/transactions/understand": "Normalize one transaction and classify it.",
    "GET /v1/graph/entities/{entity_id}": "A customer, invoice or payment and what it connects to.",
    "GET /v1/graph/paths": "How two entities are connected through the money trail.",
    "POST /v1/reconciliation/run": "Match payments to invoices across your sources.",
    "GET /v1/reconciliation/{run_id}/matches": "Matches from a run that need a human decision.",
    "POST /v1/reconciliation/matches/{match_id}/review": "Approve or reject a suggested match.",
    "GET /v1/reconciliation/weights": "The signals and weights used to score matches.",
    "GET /v1/reconciliation/summary": "Matched, unmatched and open totals from the latest run.",
    "GET /v1/reconciliation/{run_id}": "Results of one reconciliation run.",
    "POST /v1/payments/match": "Score a single payment against an invoice.",
    "POST /v1/transactions/explain": "A plain-language explanation of a match or transaction.",
    "POST /v1/financial/ask": "Ask a question about your finances; answers cite your data.",
    "POST /v1/anomalies/detect": "Find duplicates, unusual amounts and other outliers.",
    "POST /v1/anomalies/explain": "Why a transaction was flagged.",
    "POST /v1/forecast": "Project cash in and out over the coming weeks.",
    "POST /v1/simulate": "Run a what-if scenario on your cash forecast.",
    "GET /v1/actions/catalog": "Actions FinSight can take and which need approval.",
    "POST /v1/actions/execute": "Request an action such as a payment reminder.",
};

const TAG_TITLES: Record<string, string> = {
    auth: "Authentication",
    "api-keys": "API keys",
    audit: "Audit log",
    members: "Team members",
    ingestion: "Data ingestion",
    normalization: "Transactions",
    graph: "Financial graph",
    reconciliation: "Reconciliation",
    intelligence: "AI intelligence",
    anomalies: "Anomalies",
    forecast: "Forecasting",
    actions: "Actions",
};

export function groupEndpoints(spec: OpenApiSpec): EndpointGroup[] {
    const groups = new Map<string, Endpoint[]>();
    for (const [path, item] of Object.entries(spec.paths ?? {})) {
        for (const method of METHODS) {
            const op = item[method] as OpenApiOperation | undefined;
            if (!op || typeof op !== "object") continue;
            const isPublic = Array.isArray(op.security) && op.security.length === 0;
            const key = `${method.toUpperCase()} ${path}`;
            const tag = op.tags?.[0] ?? "other";
            const list = groups.get(tag) ?? [];
            list.push({
                method: method.toUpperCase(),
                path,
                summary: op.summary ?? "",
                description: ENDPOINT_DOCS[key] ?? op.description ?? "",
                scope: isPublic ? null : (ENDPOINT_SCOPES[key] ?? null),
                public: isPublic,
            });
            groups.set(tag, list);
        }
    }
    const order = Object.keys(TAG_TITLES);
    return [...groups.entries()]
        .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
        .map(([tag, endpoints]) => ({
            tag,
            title: TAG_TITLES[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1),
            endpoints,
        }));
}

export function filterGroups(groups: EndpointGroup[], query: string): EndpointGroup[] {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
        .map((g) => ({
            ...g,
            endpoints: g.endpoints.filter((e) =>
                [e.method, e.path, e.summary, e.description, e.scope ?? "", g.title]
                    .join(" ")
                    .toLowerCase()
                    .includes(q),
            ),
        }))
        .filter((g) => g.endpoints.length > 0);
}
