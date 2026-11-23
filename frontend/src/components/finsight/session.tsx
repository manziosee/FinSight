import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Currency } from "@/lib/money";
import { convertMoney, displayMoney, totalInCurrency } from "@/lib/currency-display";
import { api, type Session } from "@/lib/api";

/** Who is signed in. Live mode = a FinSight API client session (cookie held by the server);
 * otherwise the workspace runs on clearly labelled sample data. */
export type Mode = "loading" | "live" | "sample";

export interface SessionUser {
    name: string;
    title: string;
    tenantId: string;
    scopes: string[];
}

function useSessionState() {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ["session"],
        queryFn: api.session.get,
        retry: false,
        staleTime: 60_000,
    });
    const live: Extract<Session, { authenticated: true }> | null = query.data?.authenticated
        ? query.data
        : null;
    const mode: Mode = query.isPending ? "loading" : live ? "live" : "sample";
    const user: SessionUser | null = live
        ? {
              name: live.clientId,
              title: `Tenant ${live.tenantId}`,
              tenantId: live.tenantId,
              scopes: live.scopes,
          }
        : null;
    const apiUrl = query.data?.apiUrl ?? "";

    const [currency, setCurrency] = useState<Currency>("RWF");
    const money = (amount: number, source: Currency) => displayMoney(amount, source, currency);
    const convert = (amount: number, source: Currency) => convertMoney(amount, source, currency);
    const total = (rows: { amount: number; currency: Currency }[]) =>
        totalInCurrency(rows, currency);

    async function login(clientId: string, clientSecret: string) {
        const session = await api.session.login(clientId, clientSecret);
        queryClient.clear();
        queryClient.setQueryData(["session"], session);
    }
    async function logout() {
        try {
            await api.session.logout();
        } finally {
            setCurrency("RWF");
            queryClient.clear();
            queryClient.setQueryData(["session"], { authenticated: false, apiUrl });
        }
    }
    const hasScope = (scope: string) => !!user?.scopes.includes(scope);
    return {
        mode,
        isLive: mode === "live",
        user,
        apiUrl,
        login,
        logout,
        hasScope,
        currency,
        setCurrency,
        money,
        convert,
        total,
    };
}

const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
    const value = useSessionState();
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession() {
    const value = useContext(SessionContext);
    if (!value) throw new Error("SessionProvider required");
    return value;
}
