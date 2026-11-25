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

const TAG_TITLES: Record<string, string> = {
    auth: "Authentication",
    "api-keys": "API keys",
    audit: "Audit log",
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
                description: op.description ?? "",
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
