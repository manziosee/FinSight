import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatAmount, fromApiMinor } from "@/lib/money";
import { useSession } from "@/components/finsight/session";
import { useTenantValue } from "@/lib/tenant-store";

/** The run the workspace is looking at: the one you last started here, else the tenant's
 * latest (from /reconciliation/summary). There is no "list runs" endpoint yet. */
export function useLatestRun() {
    const { user } = useSession();
    const summary = useQuery({ queryKey: ["summary"], queryFn: api.summary });
    const [storedRunId, setStoredRunId] = useTenantValue<string | null>(
        user?.tenantId,
        "runId",
        null,
    );
    const runId = storedRunId ?? (summary.data?.has_data ? summary.data.run_id : null);
    return { runId, setRunId: setStoredRunId, summary };
}

/** Amount from API minor units; currency is optional because MatchOut has none (API gap). */
export function minorText(minor: number, currency?: string | null): string {
    const amount = fromApiMinor(minor);
    if (currency) return formatAmount(amount, currency);
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount);
}

export const pct = (value: number) => `${Math.round(value * 100)}%`;
export const shortId = (id: string) => (id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);
