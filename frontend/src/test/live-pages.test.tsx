import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { WorkspaceProvider } from "@/components/finsight/workspace-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    createMemoryHistory,
    createRootRoute,
    createRouter,
    RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { SessionProvider } from "@/components/finsight/session";
import { LiveDashboard } from "@/components/finsight/live/dashboard";
import { LiveSources } from "@/components/finsight/live/sources";
import { LiveReconciliation } from "@/components/finsight/live/reconciliation";
import { LiveTransactions } from "@/components/finsight/live/transactions";
import { LiveCounterparties } from "@/components/finsight/live/counterparties";
import { LiveAsk } from "@/components/finsight/live/ask";
import { LiveAnomalies } from "@/components/finsight/live/anomalies";
import { LiveForecast } from "@/components/finsight/live/forecast";
import { LiveApprovals } from "@/components/finsight/live/approvals";
import { LiveReports } from "@/components/finsight/live/reports";
import { LiveAudit } from "@/components/finsight/live/audit";
import { LiveDevelopers } from "@/components/finsight/live/developers";
import { LiveSettings } from "@/components/finsight/live/settings";

const match = {
    id: "m1",
    payment_id: "pay-1",
    invoice_ids: ["inv-1"],
    match_type: "exact",
    confidence: 0.92,
    amount_applied_minor: 85_000_000,
    residual_minor: 0,
    explanation: "Amount and reference agree.",
    exceptions: [],
    status: "pending",
};
const run = {
    run_id: "run-1",
    scope: "payment_invoice",
    matched: 1,
    unmatched: 1,
    exceptions: 0,
    matches: [match],
    unmatched_items: [{ record_id: "inv-9", side: "invoice", reason: "no payment found" }],
};
const summary = {
    has_data: true,
    run_id: "run-1",
    as_of: "2026-11-20T10:00:00Z",
    matched: 1,
    unmatched: 1,
    exceptions: 1,
    unmatched_items: run.unmatched_items,
    exception_matches: [{ ...match, match_type: "partial", explanation: "Paid short by a fee." }],
    open_invoices: [
        {
            id: "inv-9",
            counterparty: "abc ltd",
            amount_minor: 100_000_000,
            open_minor: 100_000_000,
            currency: "RWF",
            occurred_at: "2026-11-01T00:00:00Z",
        },
    ],
};
const routes: [RegExp, unknown][] = [
    [
        /\/api\/session$/,
        {
            authenticated: true,
            clientId: "demo-client",
            tenantId: "tenant_demo",
            scopes: ["audit:read", "data:write"],
            expiresAt: "2099-01-01T00:00:00Z",
            apiUrl: "https://api.example",
        },
    ],
    [/reconciliation\/summary/, summary],
    [/reconciliation\/run-1\/matches/, [match]],
    [/reconciliation\/run-1$/, run],
    [
        /actions\/catalog/,
        { send_payment_reminder: { scopes: ["actions:execute"], requires_approval: true } },
    ],
    [
        /\/forecast$/,
        {
            currency: "RWF",
            points: Array.from({ length: 56 }, (_, i) => ({
                date: `2026-12-${String((i % 28) + 1).padStart(2, "0")}`,
                projected_balance_minor: 1_000_000_00 + i,
            })),
            risk: "low",
        },
    ],
    [
        /\/audit/,
        [
            {
                tenant_id: "tenant_demo",
                actor: "demo-client",
                action: "POST /v1/reconciliation/run",
                resource: "/v1/reconciliation/run",
                outcome: "allow",
                producer: "reconciliation-service",
                occurred_at: "2026-11-20T10:00:00Z",
            },
        ],
    ],
];

beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            const hit = routes.find(([re]) => re.test(url));
            return new Response(JSON.stringify(hit ? hit[1] : {}), { status: hit ? 200 : 404 });
        }),
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

function renderLive(Component: ComponentType) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rootRoute = createRootRoute({
        component: () => (
            <QueryClientProvider client={queryClient}>
                <SessionProvider>
                    <WorkspaceProvider>
                        <TooltipProvider>
                            <Component />
                        </TooltipProvider>
                    </WorkspaceProvider>
                </SessionProvider>
            </QueryClientProvider>
        ),
    });
    const router = createRouter({
        routeTree: rootRoute,
        history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    return render(<RouterProvider router={router} />);
}

describe("live pages render API data", () => {
    it.each<[string, ComponentType, RegExp]>([
        ["dashboard", LiveDashboard, /Open receivables · RWF/],
        ["sources", LiveSources, /Upload financial data/],
        ["reconciliation", LiveReconciliation, /Amount and reference agree/],
        ["transactions", LiveTransactions, /Understand a transaction/],
        ["counterparties", LiveCounterparties, /How are two entities connected/],
        ["ask", LiveAsk, /Ask about your money/],
        ["anomalies", LiveAnomalies, /Scan open invoices \(1\)/],
        ["forecast", LiveForecast, /risk: low/],
        ["approvals", LiveApprovals, /Send payment reminder/],
        ["reports", LiveReports, /no payment found/],
        ["audit", LiveAudit, /POST \/v1\/reconciliation\/run/],
        ["developers", LiveDevelopers, /Create an API key/],
        ["settings", LiveSettings, /Demo workspace/],
    ])("%s", async (_name, Component, text) => {
        renderLive(Component);
        await waitFor(() => expect(screen.getAllByText(text).length).toBeGreaterThan(0));
    });

    it("shows RWF amounts without inventing decimals", async () => {
        renderLive(LiveDashboard);
        await waitFor(() => expect(screen.getAllByText("RWF 1,000,000").length).toBeGreaterThan(0));
    });
});
