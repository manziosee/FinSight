import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, uploadContentType } from "@/lib/api";
import { formatAmount, fromApiMinor, toApiMinor } from "@/lib/money";
import { readTenantValue, writeTenantValue } from "@/lib/tenant-store";

afterEach(() => vi.unstubAllGlobals());

describe("upload content types", () => {
    it("fills in the type browsers leave empty for CSV/JSON", () => {
        expect(uploadContentType({ name: "statement.csv", type: "" })).toBe("text/csv");
        expect(uploadContentType({ name: "records.JSON", type: "application/octet-stream" })).toBe(
            "application/json",
        );
    });
    it("keeps a known browser-provided type and rejects unsupported files", () => {
        expect(uploadContentType({ name: "x.csv", type: "application/vnd.ms-excel" })).toBe(
            "application/vnd.ms-excel",
        );
        expect(uploadContentType({ name: "photo.png", type: "image/png" })).toBeNull();
    });
});

describe("API errors", () => {
    it("surfaces RFC 9457 problem details", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            title: "Forbidden",
                            status: 403,
                            detail: "missing required scope(s): audit:read",
                        }),
                        { status: 403 },
                    ),
            ),
        );
        await expect(api.audit()).rejects.toMatchObject({
            status: 403,
            detail: "missing required scope(s): audit:read",
        });
    });
    it("sends the client header the server requires", async () => {
        const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        await api.audit(5);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("/api/v1/audit?limit=5");
        expect(new Headers(init.headers).get("x-finsight-client")).toBe("web");
    });
    it("reports network failures as status 0", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("offline");
            }),
        );
        await expect(api.summary()).rejects.toBeInstanceOf(ApiError);
    });
});

describe("API amounts", () => {
    it("round-trips the backend's minor units", () => {
        expect(fromApiMinor(85_000_000)).toBe(850_000);
        expect(toApiMinor(1250.75)).toBe(125_075);
    });
    it("formats currencies outside the display set", () => {
        expect(formatAmount(12.5, "XXX")).toBe("XXX 12.50");
        expect(formatAmount(-850000, "RWF")).toBe("−RWF 850,000");
    });
});

describe("tenant store", () => {
    it("keeps values per tenant", () => {
        writeTenantValue("t1", "runId", "run-a");
        expect(readTenantValue("t1", "runId", null)).toBe("run-a");
        expect(readTenantValue("t2", "runId", null)).toBeNull();
    });
});
