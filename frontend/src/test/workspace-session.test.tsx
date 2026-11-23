import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SessionProvider } from "@/components/finsight/session";
import { WorkspaceProvider, useWorkspace } from "@/components/finsight/workspace-context";

function Probe() {
    const { settings, setSettings } = useWorkspace();
    return (
        <>
            <span>{settings.organization}</span>
            <button onClick={() => setSettings((s) => ({ ...s, organization: "Session change" }))}>
                Change
            </button>
        </>
    );
}
function Providers({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
            <SessionProvider>
                <WorkspaceProvider>{children}</WorkspaceProvider>
            </SessionProvider>
        </QueryClientProvider>
    );
}
beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(
            async () =>
                new Response(JSON.stringify({ authenticated: false, apiUrl: "" }), { status: 200 }),
        ),
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
describe("Workspace session", () => {
    it("discards sample-workspace changes when leaving and re-entering the provider", () => {
        const first = render(
            <Providers>
                <Probe />
            </Providers>,
        );
        fireEvent.click(screen.getByText("Change"));
        expect(screen.getByText("Session change")).toBeInTheDocument();
        first.unmount();
        render(
            <Providers>
                <Probe />
            </Providers>,
        );
        expect(screen.queryByText("Session change")).not.toBeInTheDocument();
        expect(screen.getByText("Imena Traders Ltd")).toBeInTheDocument();
    });
});
