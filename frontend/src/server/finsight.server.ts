/**
 * Server-side half of the frontend ("backend for frontend").
 *
 * The browser never holds a FinSight token. Login exchanges OAuth2 client credentials
 * with the API gateway *on the server* and keeps the access token in an httpOnly,
 * SameSite=Strict cookie. Every `/api/v1/*` call from the browser is proxied here, the
 * token attached server-side and forwarded to the gateway. Same origin means no CORS,
 * and script injected into the page can't read the token.
 */

export const SESSION_COOKIE = "fs_session";
/** Custom header the browser client sends on every proxied call. Cross-site forms can't
 * set it, and without CORS a cross-site fetch can't either (CSRF defence in depth on top
 * of SameSite=Strict). */
export const CLIENT_HEADER = "x-finsight-client";
/** Largest request body the proxy accepts. ingestion-service takes up to 50 MB, but Vercel
 * Functions cap request bodies at 4.5 MB, so the default follows the platform.
 * FINSIGHT_MAX_UPLOAD_BYTES overrides it. */
export function maxUploadBytes(env: Record<string, string | undefined> = runtimeEnvRaw()): number {
    const configured = Number(env["FINSIGHT_MAX_UPLOAD_BYTES"]);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return env["VERCEL"] ? 4.5 * 1024 * 1024 : 50 * 1024 * 1024;
}
const runtimeEnvRaw = (): Record<string, string | undefined> =>
    (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const formatMB = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
const UPSTREAM_TIMEOUT_MS = 30_000;

type Env = Record<string, string | undefined>;
/** Runtime environment (read per request, so a container's env applies without a rebuild). */
const runtimeEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {};

/** Gateway base URL as seen from this server (internal network address in Docker/Fly). */
export function apiBaseUrl(env: Env = runtimeEnv()): string {
    return (env["FINSIGHT_API_URL"] ?? "http://localhost:8088").replace(/\/+$/, "");
}

/** Public gateway URL for links shown in the UI (docs, OpenAPI). */
export function publicApiUrl(env: Env = runtimeEnv()): string {
    return (env["FINSIGHT_PUBLIC_API_URL"] ?? apiBaseUrl(env)).replace(/\/+$/, "");
}

export interface SessionInfo {
    authenticated: true;
    clientId: string;
    tenantId: string;
    scopes: string[];
    expiresAt: string;
}

export function readCookie(request: Request, name: string): string | undefined {
    const header = request.headers.get("cookie");
    if (!header) return undefined;
    for (const part of header.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) return decodeURIComponent(rest.join("="));
    }
    return undefined;
}

function isSecure(request: Request): boolean {
    const proto =
        request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    return proto === "https";
}

export function sessionCookie(request: Request, token: string, maxAgeSeconds: number): string {
    const attrs = [
        `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    ];
    if (isSecure(request)) attrs.push("Secure");
    return attrs.join("; ");
}

export function clearSessionCookie(request: Request): string {
    return sessionCookie(request, "", 0);
}

/** Read the (gateway-signed) JWT's claims for display. Signature verification happens at the
 * gateway on every proxied call; this is only used to show who is signed in. */
export function sessionFromToken(token: string, now = Date.now()): SessionInfo | null {
    const payload = token.split(".")[1];
    if (!payload) return null;
    try {
        const claims = JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>;
        const exp = typeof claims["exp"] === "number" ? claims["exp"] * 1000 : 0;
        if (exp <= now) return null;
        const scope = typeof claims["scope"] === "string" ? claims["scope"] : "";
        return {
            authenticated: true,
            clientId: String(claims["sub"] ?? ""),
            tenantId: String(claims["tenant_id"] ?? ""),
            scopes: scope.split(" ").filter(Boolean),
            expiresAt: new Date(exp).toISOString(),
        };
    } catch {
        return null;
    }
}

function decodeBase64Url(value: string): string {
    const base64 = value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
}

export function problem(
    status: number,
    title: string,
    detail?: string,
    headers: Record<string, string> = {},
): Response {
    return new Response(JSON.stringify({ title, status, ...(detail ? { detail } : {}) }), {
        status,
        headers: {
            "content-type": "application/problem+json",
            "cache-control": "no-store",
            ...headers,
        },
    });
}

function json(
    body: unknown,
    init: ResponseInit = {},
    extraHeaders: Record<string, string> = {},
): Response {
    return new Response(JSON.stringify(body), {
        ...init,
        headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            ...extraHeaders,
        },
    });
}

/** GET /api/session */
export function getSession(request: Request): Response {
    const token = readCookie(request, SESSION_COOKIE);
    const session = token ? sessionFromToken(token) : null;
    const base = { apiUrl: publicApiUrl(), maxUploadBytes: maxUploadBytes() };
    if (!session)
        return json(
            { authenticated: false, ...base },
            {},
            token ? { "set-cookie": clearSessionCookie(request) } : {},
        );
    return json({ ...session, ...base });
}

/** POST /api/session — exchange client credentials for a token, kept in the cookie. */
export async function login(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
    if (request.headers.get(CLIENT_HEADER) !== "web")
        return problem(403, "Forbidden", "missing client header");
    let body: { clientId?: unknown; clientSecret?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return problem(400, "Bad Request", "expected JSON");
    }
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret : "";
    if (!clientId || !clientSecret)
        return problem(422, "Unprocessable Entity", "client ID and secret are required");

    let upstream: Response;
    try {
        upstream = await fetchImpl(`${apiBaseUrl()}/v1/auth/token`, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                accept: "application/json",
            },
            body: new URLSearchParams({
                grant_type: "client_credentials",
                client_id: clientId,
                client_secret: clientSecret,
            }),
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
    } catch {
        return problem(502, "Bad Gateway", "the FinSight API is unreachable");
    }
    if (!upstream.ok) {
        const detail =
            upstream.status === 429
                ? "too many sign-in attempts — wait a minute"
                : "invalid client ID or secret";
        return problem(
            upstream.status === 429 ? 429 : 401,
            upstream.status === 429 ? "Too Many Requests" : "Unauthorized",
            detail,
        );
    }
    const token = (await upstream.json()) as { access_token?: string; expires_in?: number };
    const session = token.access_token ? sessionFromToken(token.access_token) : null;
    if (!token.access_token || !session)
        return problem(502, "Bad Gateway", "unexpected token response");
    return json(
        { ...session, apiUrl: publicApiUrl(), maxUploadBytes: maxUploadBytes() },
        {},
        { "set-cookie": sessionCookie(request, token.access_token, token.expires_in ?? 3600) },
    );
}

/** DELETE /api/session */
export function logout(request: Request): Response {
    return new Response(null, {
        status: 204,
        headers: { "set-cookie": clearSessionCookie(request), "cache-control": "no-store" },
    });
}

const FORWARDED_REQUEST_HEADERS = ["content-type", "accept", "x-request-id"];
const FORWARDED_RESPONSE_HEADERS = [
    "content-type",
    "x-ratelimit-remaining",
    "x-request-id",
    "retry-after",
];

/** ANY /api/v1/<path> → gateway /v1/<path>, token from the session cookie. */
export async function proxy(
    request: Request,
    path: string,
    fetchImpl: typeof fetch = fetch,
): Promise<Response> {
    if (request.headers.get(CLIENT_HEADER) !== "web")
        return problem(403, "Forbidden", "missing client header");
    const token = readCookie(request, SESSION_COOKIE);
    if (!token || !sessionFromToken(token))
        return problem(401, "Unauthorized", "sign in to use the FinSight API");
    if (!/^[\w\-./]+$/.test(path) || path.split("/").includes(".."))
        return problem(400, "Bad Request", "invalid path");

    const limit = maxUploadBytes();
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > limit)
        return problem(413, "Payload Too Large", `uploads are limited to ${formatMB(limit)}`);

    const headers = new Headers({ authorization: `Bearer ${token}` });
    for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }
    const hasBody = !["GET", "HEAD"].includes(request.method);
    const body = hasBody ? await request.arrayBuffer() : undefined;
    if (body && body.byteLength > limit)
        return problem(413, "Payload Too Large", `uploads are limited to ${formatMB(limit)}`);

    const target = `${apiBaseUrl()}/v1/${path}${new URL(request.url).search}`;
    let upstream: Response;
    try {
        upstream = await fetchImpl(target, {
            method: request.method,
            headers,
            ...(body ? { body } : {}),
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
    } catch {
        return problem(502, "Bad Gateway", "the FinSight API is unreachable");
    }

    const out = new Headers({ "cache-control": "no-store" });
    for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) out.set(name, value);
    }
    // An expired or revoked token: drop the cookie so the UI returns to the sign-in state.
    if (upstream.status === 401) out.append("set-cookie", clearSessionCookie(request));
    return new Response(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
        status: upstream.status,
        headers: out,
    });
}

/** GET /api/health — is the gateway up? */
export async function health(fetchImpl: typeof fetch = fetch): Promise<Response> {
    try {
        const upstream = await fetchImpl(`${apiBaseUrl()}/health`, {
            signal: AbortSignal.timeout(5_000),
        });
        const body = upstream.ok ? ((await upstream.json()) as { version?: string }) : {};
        return json({ ok: upstream.ok, version: body.version ?? null });
    } catch {
        return json({ ok: false, version: null });
    }
}

/** GET /api/openapi — the gateway's public, aggregated OpenAPI spec. No session needed: the
 * public Developers page lists every endpoint from it. */
export async function openapi(fetchImpl: typeof fetch = fetch): Promise<Response> {
    try {
        const upstream = await fetchImpl(`${apiBaseUrl()}/openapi.json`, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(10_000),
        });
        if (!upstream.ok)
            return problem(502, "Bad Gateway", "the API specification is unavailable");
        return new Response(await upstream.text(), {
            status: 200,
            headers: {
                "content-type": "application/json",
                "cache-control": "public, max-age=300",
            },
        });
    } catch {
        return problem(502, "Bad Gateway", "the FinSight API is unreachable");
    }
}
