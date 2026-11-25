import { useQueries, useQuery } from "@tanstack/react-query";
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

export interface RecordInfo {
    counterparty?: string;
    reference?: string;
    date?: string;
    description?: string;
    currency?: string;
    amountMinor?: number;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** People-friendly facts about records (customer, reference, date) from the financial graph,
 * so screens can show "Kigali Foods · INV-440" instead of record IDs. */
export function useRecordInfo(ids: string[]): Record<string, RecordInfo> {
    const unique = [...new Set(ids.filter(Boolean))];
    const records = useQueries({
        queries: unique.map((id) => ({
            queryKey: ["entity", id, 1],
            queryFn: () => api.entity(id, 1),
            staleTime: 5 * 60_000,
            retry: false,
        })),
    });
    const customerOf = (i: number) =>
        str(records[i]?.data?.connected.find((c) => c["kind"] === "Customer")?.["id"]);
    const customerIds = [
        ...new Set(unique.map((_, i) => customerOf(i)).filter((c): c is string => !!c)),
    ];
    const customers = useQueries({
        queries: customerIds.map((id) => ({
            queryKey: ["entity", id, 1],
            queryFn: () => api.entity(id, 1),
            staleTime: 5 * 60_000,
            retry: false,
        })),
    });
    const names = new Map(
        customerIds.map((id, i) => [id, str(customers[i]?.data?.entity["name"])] as const),
    );
    const out: Record<string, RecordInfo> = {};
    unique.forEach((id, i) => {
        const e = records[i]?.data?.entity;
        if (!e) return;
        const cust = customerOf(i);
        const name = cust ? names.get(cust) : undefined;
        const date = str(e["occurred_at"])?.slice(0, 10);
        const description = str(e["description"]);
        const reference = str(e["reference"]);
        const currency = str(e["currency"]);
        out[id] = {
            ...(name ? { counterparty: name } : {}),
            ...(reference ? { reference } : {}),
            ...(date ? { date } : {}),
            ...(description ? { description } : {}),
            ...(currency ? { currency } : {}),
            ...(typeof e["amount_minor"] === "number" ? { amountMinor: e["amount_minor"] } : {}),
        };
    });
    return out;
}

/** "Kigali Foods · INV-440", falling back to the description, then a short ID. */
export function recordLabel(info: RecordInfo | undefined, id: string): string {
    if (!info) return shortId(id);
    const head = info.counterparty ?? info.description;
    return [head, info.reference].filter(Boolean).join(" · ") || shortId(id);
}
