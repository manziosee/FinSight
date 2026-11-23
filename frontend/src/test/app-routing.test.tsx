import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
    it.each([
        "sources",
        "counterparties",
        "ask",
        "anomalies",
        "forecast",
        "approvals",
        "reports",
        "audit",
        "developers",
        "settings",
    ])("matches the %s workspace page", (page) => {
        const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
        expect(router.matchRoutes(`/app/${page}`).at(-1)?.routeId).toBe(`/app/${page}`);
    });
    it("matches a page for / instead of falling back to not found", () => {
        const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

        const matches = router.matchRoutes("/");

        expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    });
});
