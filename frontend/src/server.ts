import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
    fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
    if (!serverEntryPromise) {
        serverEntryPromise = import("@tanstack/react-start/server-entry").then(
            (m) => (m.default ?? m) as ServerEntry,
        );
    }
    return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
    if (response.status < 500) return response;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return response;

    const body = await response.clone().text();
    if (!isH3SwallowedErrorBody(body)) return response;

    console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
    return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
    });
}

function isH3SwallowedErrorBody(body: string): boolean {
    try {
        const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
        return payload.unhandled === true && payload.message === "HTTPError";
    } catch {
        return false;
    }
}

// Every API call is same-origin (/api/* is proxied server-side), so connect-src can be
// 'self': even injected script has nowhere to send data. Hydration needs inline scripts;
// fonts come from Google Fonts.
const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "strict-transport-security": "max-age=63072000; includeSubDomains",
    "cross-origin-opener-policy": "same-origin",
};

// Dev (vite) needs eval and websockets for hot reload, so headers apply to production only.
const isProduction =
    (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[
        "NODE_ENV"
    ] === "production";

function withSecurityHeaders(response: Response): Response {
    if (!isProduction) return response;
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        if (!headers.has(name)) headers.set(name, value);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

export default {
    async fetch(request: Request, env: unknown, ctx: unknown) {
        try {
            const handler = await getServerEntry();
            const response = await handler.fetch(request, env, ctx);
            return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
        } catch (error) {
            console.error(error);
            return withSecurityHeaders(
                new Response(renderErrorPage(), {
                    status: 500,
                    headers: { "content-type": "text/html; charset=utf-8" },
                }),
            );
        }
    },
};
