/**
 * Typed browser client for the FinSight API. Every call goes to this app's own origin
 * (`/api/...`); the server attaches the session token and forwards to the gateway
 * (see src/server/finsight.server.ts). Shapes mirror docs/api/finsight.openapi.json.
 */

import type { OpenApiSpec } from "./api-reference";

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly title: string,
        readonly detail?: string,
    ) {
        super(detail ?? title);
        this.name = "ApiError";
    }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("x-finsight-client", "web");
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (init.body && typeof init.body === "string" && !headers.has("content-type"))
        headers.set("content-type", "application/json");
    let res: Response;
    try {
        res = await fetch(path, { ...init, headers, credentials: "same-origin" });
    } catch {
        throw new ApiError(0, "Network error", "could not reach the FinSight server");
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data: unknown = text ? safeJson(text) : undefined;
    if (!res.ok) {
        const p = (data ?? {}) as { title?: string; detail?: unknown };
        const detail =
            typeof p.detail === "string"
                ? p.detail
                : Array.isArray(p.detail)
                  ? "invalid request"
                  : undefined;
        throw new ApiError(res.status, p.title ?? res.statusText ?? "Request failed", detail);
    }
    return data as T;
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

const v1 = (path: string) => `/api/v1/${path}`;
const post = <T>(path: string, body: unknown) =>
    request<T>(v1(path), { method: "POST", body: JSON.stringify(body) });

export type MemberRole = "admin" | "analyst" | "viewer";
export interface Member {
    client_id: string;
    role: MemberRole | "custom";
    scopes: string[];
    is_active: boolean;
    created_at: string;
    is_you: boolean;
}
export interface MemberCredentials {
    member: Member;
    client_secret: string;
}

// ---- session ---------------------------------------------------------------------------

export type Session =
    | { authenticated: false; apiUrl: string; maxUploadBytes?: number }
    | {
          authenticated: true;
          clientId: string;
          tenantId: string;
          scopes: string[];
          expiresAt: string;
          apiUrl: string;
          maxUploadBytes?: number;
      };

// ---- shapes ----------------------------------------------------------------------------

export interface IngestionAccepted {
    ingestion_id: string;
    status: "received";
    s3_uri: string;
    status_url: string;
}
export interface IngestionStatus {
    ingestion_id: string;
    status: "received" | "completed" | "failed";
    source: string;
    record_count: number;
    warnings: string[];
    error_summary?: string | null;
    created_at: string;
    completed_at?: string | null;
}
export interface MatchOut {
    id: string;
    payment_id: string;
    invoice_ids: string[];
    match_type: string;
    confidence: number;
    amount_applied_minor: number;
    residual_minor: number;
    explanation: string;
    exceptions: string[];
    status: string;
}
export interface UnmatchedOut {
    record_id: string;
    side: "payment" | "invoice" | string;
    reason: string;
}
export interface RunResult {
    run_id: string;
    scope: string;
    matched: number;
    unmatched: number;
    exceptions: number;
    matches: MatchOut[];
    unmatched_items: UnmatchedOut[];
}
export interface OpenInvoice {
    id: string;
    counterparty: string | null;
    amount_minor: number;
    open_minor: number;
    currency: string;
    occurred_at: string;
}
export type ReconciliationSummary =
    | { has_data: false }
    | {
          has_data: true;
          run_id: string;
          as_of: string;
          matched: number;
          unmatched: number;
          exceptions: number;
          unmatched_items: UnmatchedOut[];
          exception_matches: MatchOut[];
          open_invoices: OpenInvoice[];
      };
export interface Answer {
    answer: string;
    evidence: Record<string, unknown>;
    confidence: number;
    grounded: boolean;
}
export interface FinancialRecord {
    id: string;
    type: string;
    source: string;
    amount: { minor_units: number; currency: string };
    direction: string;
    occurred_at: string;
    reference?: string | null;
    description?: string | null;
    counterparty?: {
        name?: string | null;
        normalized_name?: string | null;
        external_id?: string | null;
    } | null;
    confidence: number;
}
export interface UnderstandResponse {
    record: FinancialRecord;
    classification: string;
    confidence: number;
    warnings: string[];
}
export interface EntityView {
    entity: Record<string, unknown>;
    connected: Record<string, unknown>[];
}
export interface AnomalyTxn {
    id: string;
    amount_minor: number;
    currency?: string;
    counterparty?: string | null;
    reference?: string | null;
}
export interface Finding {
    record_id: string;
    rule: string;
    severity: string;
    score: number;
    explanation: string;
}
export interface ForecastResponse {
    currency: string;
    points: { date: string; projected_balance_minor: number }[];
    risk: string;
    status?: string;
}
export type ActionCatalog = Record<string, { scopes: string[]; requires_approval: boolean }>;
export interface ActionResult {
    action_id: string;
    action: string;
    status: string;
    requires_approval: boolean;
    detail: string;
}
export interface AuditEntry {
    tenant_id: string;
    actor: string;
    action: string;
    resource: string;
    outcome: string;
    producer: string;
    occurred_at: string;
}
export interface ApiKeyCreated {
    id: string;
    api_key: string;
    name: string;
    scopes: string[];
}

// The ingestion service accepts these content types (services/ingestion-service config).
const UPLOAD_TYPES: Record<string, string> = {
    csv: "text/csv",
    json: "application/json",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    pdf: "application/pdf",
    txt: "text/plain",
};
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES)
    .map((e) => `.${e}`)
    .join(",");

/** Browsers often send an empty type (or octet-stream) for .csv/.json; the API rejects that. */
export function uploadContentType(file: { name: string; type: string }): string | null {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const known = Object.values(UPLOAD_TYPES);
    if (file.type && known.includes(file.type)) return file.type;
    return UPLOAD_TYPES[ext] ?? null;
}

// ---- endpoints -------------------------------------------------------------------------

export const api = {
    session: {
        get: () => request<Session>("/api/session"),
        login: (clientId: string, clientSecret: string) =>
            request<Session>("/api/session", {
                method: "POST",
                body: JSON.stringify({ clientId, clientSecret }),
            }),
        logout: () => request<void>("/api/session", { method: "DELETE" }),
    },
    health: () => request<{ ok: boolean; version: string | null }>("/api/health"),
    openapi: () => request<OpenApiSpec>("/api/openapi"),
    members: {
        list: () => request<Member[]>(v1("members")),
        add: (clientId: string, role: MemberRole) =>
            post<MemberCredentials>("members", { client_id: clientId, role }),
        update: (clientId: string, change: { role?: MemberRole; is_active?: boolean }) =>
            request<Member>(v1(`members/${encodeURIComponent(clientId)}`), {
                method: "PATCH",
                body: JSON.stringify(change),
            }),
        resetSecret: (clientId: string) =>
            post<MemberCredentials>(`members/${encodeURIComponent(clientId)}/reset-secret`, {}),
        remove: (clientId: string) =>
            request<void>(v1(`members/${encodeURIComponent(clientId)}`), { method: "DELETE" }),
    },

    upload(file: File, source: string) {
        const type = uploadContentType(file);
        if (!type)
            throw new ApiError(
                415,
                "Unsupported file",
                "upload CSV, JSON, Excel, PDF or text files",
            );
        const form = new FormData();
        form.append("file", new File([file], file.name, { type }));
        return request<IngestionAccepted>(v1(`data/upload?source=${encodeURIComponent(source)}`), {
            method: "POST",
            body: form,
        });
    },
    ingestion: (id: string) =>
        request<IngestionStatus>(v1(`data/ingestions/${encodeURIComponent(id)}`)),

    runReconciliation: (ingestionId?: string) =>
        post<RunResult>("reconciliation/run", {
            scope: "payment_invoice",
            ...(ingestionId ? { ingestion_id: ingestionId } : {}),
        }),
    run: (runId: string) => request<RunResult>(v1(`reconciliation/${encodeURIComponent(runId)}`)),
    matches: (runId: string, status = "pending") =>
        request<MatchOut[]>(
            v1(
                `reconciliation/${encodeURIComponent(runId)}/matches?status=${encodeURIComponent(status)}`,
            ),
        ),
    review: (
        matchId: string,
        decision: "accept" | "reject" | "correct",
        correctedInvoiceId?: string,
        note?: string,
    ) =>
        post<MatchOut>(`reconciliation/matches/${encodeURIComponent(matchId)}/review`, {
            decision,
            ...(correctedInvoiceId ? { corrected_invoice_id: correctedInvoiceId } : {}),
            ...(note ? { note } : {}),
        }),
    summary: () => request<ReconciliationSummary>(v1("reconciliation/summary")),
    weights: () =>
        request<{ tenant_id: string; weights: Record<string, number> }>(
            v1("reconciliation/weights"),
        ),

    explain: (subject: string, runId?: string, matchId?: string) =>
        post<Answer>("transactions/explain", {
            subject,
            ...(runId ? { run_id: runId } : {}),
            ...(matchId ? { match_id: matchId } : {}),
        }),
    ask: (question: string) => post<Answer>("financial/ask", { question }),
    understand: (transaction: Record<string, unknown>, source = "api") =>
        post<UnderstandResponse>("transactions/understand", { transaction, source }),

    entity: (id: string, depth = 2) =>
        request<EntityView>(v1(`graph/entities/${encodeURIComponent(id)}?depth=${depth}`)),
    paths: (fromId: string, toId: string) =>
        request<{ paths: string[][] }>(
            v1(
                `graph/paths?from_id=${encodeURIComponent(fromId)}&to_id=${encodeURIComponent(toId)}`,
            ),
        ),

    detect: (transactions: AnomalyTxn[], zThreshold = 3) =>
        post<Finding[]>("anomalies/detect", { transactions, z_threshold: zThreshold }),
    forecast: (body: {
        opening_balance_minor: number;
        horizon_days: number;
        expected_inflows_minor: number;
        expected_outflows_minor: number;
        currency: string;
    }) => post<ForecastResponse>("forecast", body),

    actionsCatalog: () => request<ActionCatalog>(v1("actions/catalog")),
    executeAction: (action: string, params: Record<string, unknown>, dryRun: boolean) =>
        post<ActionResult>("actions/execute", { action, params, dry_run: dryRun }),

    audit: (limit = 500) => request<AuditEntry[]>(v1(`audit?limit=${limit}`)),
    createApiKey: (name: string, scopes: string[]) =>
        post<ApiKeyCreated>("api-keys", { name, scopes }),

    /** Developer explorer: any GET under /v1, returned with status and timing. */
    async raw(path: string): Promise<{ status: number; ms: number; body: unknown }> {
        const started = performance.now();
        const res = await fetch(v1(path.replace(/^\/?v1\//, "").replace(/^\//, "")), {
            headers: { "x-finsight-client": "web", accept: "application/json" },
            credentials: "same-origin",
        });
        const text = await res.text();
        return {
            status: res.status,
            ms: Math.round(performance.now() - started),
            body: text ? safeJson(text) : null,
        };
    },
};
