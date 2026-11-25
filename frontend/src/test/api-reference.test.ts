import { describe, expect, it, vi } from "vitest";
import {
    ENDPOINT_SCOPES,
    filterGroups,
    groupEndpoints,
    type OpenApiSpec,
} from "@/lib/api-reference";
import { openapi } from "@/server/finsight.server";

const spec: OpenApiSpec = {
    paths: {
        "/v1/auth/token": { post: { tags: ["auth"], summary: "Token", security: [] } },
        "/v1/reconciliation/run": { post: { tags: ["reconciliation"], summary: "Run" } },
        "/v1/reconciliation/summary": { get: { tags: ["reconciliation"], summary: "Summary" } },
        "/v1/data/upload": {
            post: { tags: ["ingestion"], summary: "Upload" },
            parameters: [],
        },
        "/v1/new/thing": { get: { tags: ["brand-new"], summary: "New" } },
    },
};

describe("groupEndpoints", () => {
    const groups = groupEndpoints(spec);

    it("groups by tag in product order, unknown tags last", () => {
        expect(groups.map((g) => g.tag)).toEqual([
            "auth",
            "ingestion",
            "reconciliation",
            "brand-new",
        ]);
        expect(groups.at(-1)?.title).toBe("Brand-new");
    });

    it("marks public endpoints and attaches the required scope", () => {
        const all = groups.flatMap((g) => g.endpoints);
        const token = all.find((e) => e.path === "/v1/auth/token");
        expect(token).toMatchObject({ method: "POST", public: true, scope: null });
        expect(all.find((e) => e.path === "/v1/reconciliation/run")?.scope).toBe(
            "reconciliation:run",
        );
        expect(all.find((e) => e.path === "/v1/new/thing")).toMatchObject({
            public: false,
            scope: null,
        });
    });

    it("ignores non-operation keys such as parameters", () => {
        const upload = groups.find((g) => g.tag === "ingestion")?.endpoints ?? [];
        expect(upload).toHaveLength(1);
    });

    it("filters by path, scope or group title", () => {
        expect(filterGroups(groups, "").length).toBe(groups.length);
        expect(filterGroups(groups, "reconciliation:read")[0]?.endpoints).toHaveLength(1);
        expect(filterGroups(groups, "authentication")[0]?.tag).toBe("auth");
        expect(filterGroups(groups, "nothing-matches")).toEqual([]);
    });

    it("every mapped scope is a known platform scope", () => {
        const known = new Set(
            "data:write transactions:read transactions:write payments:match reconciliation:run reconciliation:read graph:read anomalies:read financial:ask forecast:run actions:execute api-keys:write audit:read".split(
                " ",
            ),
        );
        for (const scope of Object.values(ENDPOINT_SCOPES)) expect(known.has(scope)).toBe(true);
    });
});

describe("openapi route", () => {
    it("passes the gateway spec through with caching", async () => {
        const fetchImpl = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit) =>
                new Response(JSON.stringify(spec), { status: 200 }),
        );
        const res = await openapi(fetchImpl as unknown as typeof fetch);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toContain("max-age");
        expect(await res.json()).toEqual(spec);
        expect(String(fetchImpl.mock.calls[0]?.[0])).toMatch(/\/openapi\.json$/);
    });

    it("returns 502 when the gateway is down or errors", async () => {
        const down = vi.fn(async () => {
            throw new Error("ECONNREFUSED");
        });
        expect((await openapi(down as unknown as typeof fetch)).status).toBe(502);
        const bad = vi.fn(async () => new Response("", { status: 500 }));
        expect((await openapi(bad as unknown as typeof fetch)).status).toBe(502);
    });
});
