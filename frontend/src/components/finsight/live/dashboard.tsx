import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, GitMerge, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatAmount, fromApiMinor } from "@/lib/money";
import { useSession } from "@/components/finsight/session";
import { ApiGap, ErrorLine, Pill, SourceBadge } from "@/components/finsight/page-kit";
import { useLatestRun, minorText, shortId } from "./common";

export function LiveDashboard() {
    const { user } = useSession();
    const { summary } = useLatestRun();
    const queryClient = useQueryClient();
    const run = useMutation({
        mutationFn: () => api.runReconciliation(),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["summary"] }),
    });
    const data = summary.data;

    if (summary.isPending)
        return <p className="text-sm text-muted-foreground">Loading your workspace…</p>;
    if (summary.error) return <ErrorLine error={summary.error} />;
    if (!data?.has_data)
        return (
            <div className="mx-auto max-w-3xl space-y-6 py-10">
                <h1 className="text-2xl font-semibold">Welcome, {user?.name}</h1>
                <p className="text-muted-foreground">
                    No reconciliation has run for {user?.title.toLowerCase()} yet. Upload a bank
                    statement and your invoices, then run a reconciliation.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button asChild>
                        <Link to="/app/sources">
                            <Upload />
                            Upload data
                        </Link>
                    </Button>
                    <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
                        <GitMerge />
                        {run.isPending ? "Running…" : "Run reconciliation"}
                    </Button>
                </div>
                <ErrorLine error={run.error} />
            </div>
        );

    // Open invoice totals per currency — never added across currencies.
    const openByCurrency = new Map<string, number>();
    for (const inv of data.open_invoices)
        openByCurrency.set(inv.currency, (openByCurrency.get(inv.currency) ?? 0) + inv.open_minor);
    const byCounterparty = new Map<string, number>();
    const mainCurrency = [...openByCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    for (const inv of data.open_invoices.filter((i) => i.currency === mainCurrency)) {
        const key = inv.counterparty ?? "Unknown";
        byCounterparty.set(key, (byCounterparty.get(key) ?? 0) + fromApiMinor(inv.open_minor));
    }
    const chart = [...byCounterparty.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, open]) => ({ name, open }));
    const total = data.matched + data.unmatched;
    const kpis = [
        {
            label: "Matched",
            value: String(data.matched),
            detail: total ? `${Math.round((data.matched / total) * 100)}% of records` : undefined,
        },
        { label: "Unmatched", value: String(data.unmatched) },
        { label: "Exceptions", value: String(data.exceptions), to: true },
        { label: "Open invoices", value: String(data.open_invoices.length) },
        ...[...openByCurrency.entries()].map(([cur, minor]) => ({
            label: `Open receivables · ${cur}`,
            value: formatAmount(fromApiMinor(minor), cur),
        })),
    ];

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                        Welcome, {user?.name} <SourceBadge live />
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Latest run {shortId(data.run_id)} · {new Date(data.as_of).toLocaleString()}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={run.isPending}
                    onClick={() => run.mutate()}
                >
                    <GitMerge />
                    {run.isPending ? "Running…" : "Run reconciliation"}
                </Button>
            </div>
            <ErrorLine error={run.error} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                {kpis.map((k) => (
                    <div key={k.label} className="rounded-lg border bg-card p-4">
                        <p className="text-xs text-muted-foreground">{k.label}</p>
                        <p className="num mt-1 text-right text-base font-semibold lg:text-lg">
                            {k.value}
                        </p>
                        {k.detail && (
                            <p className="mt-1 text-right text-xs text-muted-foreground">
                                {k.detail}
                            </p>
                        )}
                        {k.to && (
                            <Link
                                to="/app/reconciliation"
                                className="mt-1 flex justify-end text-xs text-primary"
                            >
                                Review <ArrowUpRight className="size-3" />
                            </Link>
                        )}
                    </div>
                ))}
            </div>

            {data.exception_matches.length > 0 && (
                <div className="rounded-lg border bg-accent/40 p-5">
                    <p className="flex items-center gap-2 text-sm font-medium text-accent-foreground">
                        <Sparkles className="size-4" /> What needs a look
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                        {data.exception_matches.slice(0, 4).map((m) => (
                            <li key={m.id}>
                                {m.explanation} <Pill>{m.match_type}</Pill>
                            </li>
                        ))}
                    </ul>
                    <Button asChild variant="link" className="mt-2 h-auto p-0">
                        <Link to="/app/ask">
                            Ask FinSight about these
                            <ArrowUpRight />
                        </Link>
                    </Button>
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border bg-card p-4">
                    <h2 className="text-sm font-medium">
                        Open receivables by counterparty{mainCurrency ? ` · ${mainCurrency}` : ""}
                    </h2>
                    {chart.length ? (
                        <div className="mt-3 h-56">
                            <ResponsiveContainer>
                                <BarChart data={chart}>
                                    <CartesianGrid vertical={false} stroke="var(--border)" />
                                    <XAxis
                                        dataKey="name"
                                        fontSize={11}
                                        stroke="var(--muted-foreground)"
                                    />
                                    <YAxis
                                        tickFormatter={(n) =>
                                            Intl.NumberFormat("en", { notation: "compact" }).format(
                                                n,
                                            )
                                        }
                                        fontSize={11}
                                        stroke="var(--muted-foreground)"
                                    />
                                    <Tooltip
                                        formatter={(v) =>
                                            mainCurrency
                                                ? formatAmount(Number(v), mainCurrency)
                                                : String(v)
                                        }
                                        contentStyle={{
                                            background: "var(--popover)",
                                            border: "1px solid var(--border)",
                                        }}
                                    />
                                    <Bar
                                        dataKey="open"
                                        fill="var(--warning)"
                                        radius={[3, 3, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="py-16 text-center text-sm text-muted-foreground">
                            No open invoices.
                        </p>
                    )}
                </div>
                <div className="space-y-3">
                    <ApiGap needs="GET /v1/metrics/cash-position, GET /v1/metrics/trends">
                        Cash position and weekly matched/unmatched trends need time-series endpoints
                        the API doesn't have yet.
                    </ApiGap>
                </div>
            </div>

            <div className="rounded-lg border bg-card">
                <h2 className="border-b px-4 py-3 text-sm font-medium">
                    Unmatched records · latest run
                </h2>
                <ul className="divide-y">
                    {data.unmatched_items.map((u) => (
                        <li
                            key={`${u.side}-${u.record_id}`}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                        >
                            <span className="flex items-center gap-3">
                                <Pill tone="warning">{u.side}</Pill>
                                <span className="font-mono text-xs">{shortId(u.record_id)}</span>
                            </span>
                            <span className="text-muted-foreground">{u.reason}</span>
                        </li>
                    ))}
                    {!data.unmatched_items.length && (
                        <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                            Everything in the latest run matched.
                        </li>
                    )}
                </ul>
                {data.open_invoices.length > 0 && (
                    <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                        Largest open invoice:{" "}
                        {(() => {
                            const top = [...data.open_invoices].sort(
                                (a, b) => b.open_minor - a.open_minor,
                            )[0];
                            return top
                                ? `${top.counterparty ?? "Unknown"} · ${minorText(top.open_minor, top.currency)}`
                                : "";
                        })()}
                    </p>
                )}
            </div>
        </div>
    );
}
