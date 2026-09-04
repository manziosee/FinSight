"use client";

/** Thin typed client for the FinSight API (via api-gateway). No server component ever
 * touches this — the token lives only in the browser's localStorage. */

export const API_URL =
  process.env.NEXT_PUBLIC_FINSIGHT_API_URL ?? "http://localhost:8088";

const TOKEN_KEY = "finsight.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`${status}: ${detail}`);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { form?: Record<string, string> } = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);

  let body = init.body;
  if (init.form) {
    const params = new URLSearchParams(init.form);
    body = params.toString();
    headers.set("content-type", "application/x-www-form-urlencoded");
  } else if (body && !(body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, body });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      detail = JSON.parse(text).detail ?? JSON.parse(text).title ?? text;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- auth -------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export async function login(clientId: string, clientSecret: string): Promise<TokenResponse> {
  return request<TokenResponse>("/v1/auth/token", {
    method: "POST",
    form: { grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret },
  });
}

// --- ingestion ----------------------------------------------------------

export interface IngestionAccepted {
  ingestion_id: string;
  status: string;
  s3_uri: string;
}

export async function uploadFile(file: File, source: string): Promise<IngestionAccepted> {
  const form = new FormData();
  form.append("file", file);
  return request<IngestionAccepted>(`/v1/data/upload?source=${encodeURIComponent(source)}`, {
    method: "POST",
    body: form,
  });
}

// --- reconciliation -------------------------------------------------------

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
  side: string;
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

export async function runReconciliation(): Promise<RunResult> {
  return request<RunResult>("/v1/reconciliation/run", {
    method: "POST",
    body: JSON.stringify({ scope: "payment_invoice" }),
  });
}

export async function getRun(runId: string): Promise<RunResult> {
  return request<RunResult>(`/v1/reconciliation/${runId}`);
}

export async function reviewMatch(
  matchId: string,
  decision: "accept" | "reject" | "correct",
): Promise<MatchOut> {
  return request<MatchOut>(`/v1/reconciliation/matches/${matchId}/review`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export interface WeightsResponse {
  tenant_id: string;
  weights: Record<string, number>;
}

export async function getWeights(): Promise<WeightsResponse> {
  return request<WeightsResponse>("/v1/reconciliation/weights");
}

// --- intelligence ---------------------------------------------------------

export interface Answer {
  answer: string;
  evidence: Record<string, unknown>;
  confidence: number;
  grounded: boolean;
}

export async function askQuestion(question: string): Promise<Answer> {
  return request<Answer>("/v1/financial/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export async function explainMatch(runId: string, matchId: string): Promise<Answer> {
  return request<Answer>("/v1/transactions/explain", {
    method: "POST",
    body: JSON.stringify({ subject: `match ${matchId}`, run_id: runId, match_id: matchId }),
  });
}

// --- audit ------------------------------------------------------------

export interface AuditEntry {
  tenant_id: string;
  actor: string;
  action: string;
  resource: string;
  outcome: string;
  producer: string;
  occurred_at: string;
}

export async function getAudit(limit = 50): Promise<AuditEntry[]> {
  return request<AuditEntry[]>(`/v1/audit?limit=${limit}`);
}
