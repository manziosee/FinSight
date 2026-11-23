import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    login,
    logout,
    proxy,
    getSession,
    sessionFromToken,
    readCookie,
    SESSION_COOKIE,
} from "@/server/finsight.server";

const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = (claims: object) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;
const valid = token({
    sub: "demo-client",
    tenant_id: "tenant_demo",
    scope: "data:write audit:read",
    exp: Math.floor(Date.now() / 1000) + 600,
});
const web = { "x-finsight-client": "web" };

beforeEach(() => {
    vi.stubGlobal("process", { env: { FINSIGHT_API_URL: "http://gateway:8000/" } });
});
afterEach(() => vi.unstubAllGlobals());

describe("session token", () => {
    it("reads tenant, scopes and expiry from the JWT", () => {
        expect(sessionFromToken(valid)).toMatchObject({
            clientId: "demo-client",
            tenantId: "tenant_demo",
            scopes: ["data:write", "audit:read"],
        });
    });
    it("treats an expired token as signed out", () => {
        expect(
            sessionFromToken(token({ sub: "x", exp: Math.floor(Date.now() / 1000) - 1 })),
        ).toBeNull();
    });
    it("parses the session cookie among others", () => {
        const req = new Request("http://app/", {
            headers: { cookie: `a=1; ${SESSION_COOKIE}=${valid}; b=2` },
        });
        expect(readCookie(req, SESSION_COOKIE)).toBe(valid);
    });
});

describe("login", () => {
    it("exchanges client credentials server-side and sets an httpOnly SameSite=Strict cookie", async () => {
        const fetchImpl = vi.fn(
            async () =>
                new Response(JSON.stringify({ access_token: valid, expires_in: 600 }), {
                    status: 200,
                }),
        );
        const res = await login(
            new Request("https://app/api/session", {
                method: "POST",
                headers: { ...web, "content-type": "application/json" },
                body: JSON.stringify({ clientId: "demo-client", clientSecret: "s3cret" }),
            }),
            fetchImpl as unknown as typeof fetch,
        );
        expect(res.status).toBe(200);
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("http://gateway:8000/v1/auth/token");
        expect(String(init.body)).toContain("grant_type=client_credentials");
        const cookie = res.headers.get("set-cookie") ?? "";
        expect(cookie).toMatch(/HttpOnly/);
        expect(cookie).toMatch(/SameSite=Strict/);
        expect(cookie).toMatch(/Secure/); // https request
        expect(await res.text()).not.toContain(valid); // the token never reaches the browser
    });
    it("rejects requests without the client header (CSRF)", async () => {
        const res = await login(
            new Request("http://app/api/session", { method: "POST", body: "{}" }),
        );
        expect(res.status).toBe(403);
    });
    it("maps rejected credentials to 401 without echoing the gateway error", async () => {
        const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 }));
        const res = await login(
            new Request("http://app/api/session", {
                method: "POST",
                headers: web,
                body: JSON.stringify({ clientId: "a", clientSecret: "b" }),
            }),
            fetchImpl as unknown as typeof fetch,
        );
        expect(res.status).toBe(401);
    });
    it("logout expires the cookie", () => {
        expect(logout(new Request("http://app/api/session")).headers.get("set-cookie")).toMatch(
            /Max-Age=0/,
        );
    });
});

describe("proxy", () => {
    const authed = (path: string, init: RequestInit = {}) =>
        new Request(`http://app/api/v1/${path}`, {
            ...init,
            headers: {
                ...web,
                cookie: `${SESSION_COOKIE}=${valid}`,
                ...(init.headers as Record<string, string>),
            },
        });

    it("forwards to the gateway with the bearer token and query string", async () => {
        const fetchImpl = vi.fn(
            async () =>
                new Response('{"ok":true}', {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
        );
        const res = await proxy(
            authed("audit?limit=5"),
            "audit",
            fetchImpl as unknown as typeof fetch,
        );
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("http://gateway:8000/v1/audit?limit=5");
        expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${valid}`);
        expect(res.status).toBe(200);
    });
    it("requires a session", async () => {
        const res = await proxy(new Request("http://app/api/v1/audit", { headers: web }), "audit");
        expect(res.status).toBe(401);
    });
    it("refuses path traversal", async () => {
        const fetchImpl = vi.fn();
        const res = await proxy(authed("x"), "../health", fetchImpl as unknown as typeof fetch);
        expect(res.status).toBe(400);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
    it("clears the cookie when the gateway says the token is no longer valid", async () => {
        const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 }));
        const res = await proxy(authed("audit"), "audit", fetchImpl as unknown as typeof fetch);
        expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    });
    it("returns 502 when the gateway is unreachable", async () => {
        const fetchImpl = vi.fn(async () => {
            throw new TypeError("connect ECONNREFUSED");
        });
        expect(
            (await proxy(authed("audit"), "audit", fetchImpl as unknown as typeof fetch)).status,
        ).toBe(502);
    });
});

describe("getSession", () => {
    it("reports signed out and clears a stale cookie", async () => {
        const stale = token({ sub: "x", exp: 1 });
        const res = getSession(
            new Request("http://app/api/session", {
                headers: { cookie: `${SESSION_COOKIE}=${stale}` },
            }),
        );
        expect(await res.json()).toMatchObject({ authenticated: false });
        expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    });
});
