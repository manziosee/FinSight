import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { ArrowUpRight, GitMerge, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatAmount, fromApiMinor } from "@/lib/money";
import { useSession } from "@/components/finsight/session";
import { ErrorLine, Pill } from "@/components/finsight/page-kit";
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
                <h1 className="text-2xl font-semibold">Welcome, {user?.displayName}</h1>
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
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Welcome back, {user?.displayName}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Last reconciled{" "}
                        {new Date(data.as_of).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                        })}
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
                    <div key={k.label} className="lift rounded-lg border bg-card p-4">
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
                <div className="lift rounded-lg border bg-card p-4">
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
                <MatchRate
                    matched={data.matched}
                    unmatched={data.unmatched}
                    exceptions={data.exceptions}
                />
            </div>

            <div className="rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <h2 className="text-sm font-medium">Unmatched records</h2>
                    <Button asChild variant="ghost" size="sm">
                        <Link to="/app/reconciliation">
                            Review all
                            <ArrowUpRight />
                        </Link>
                    </Button>
                </div>
                <ul className="divide-y">
                    {data.unmatched_items.map((u) => (
                        <li
                            key={`${u.side}-${u.record_id}`}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm transition-colors hover:bg-muted/40"
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

const RATE_COLORS = ["var(--success)", "var(--warning)", "var(--danger)"];

function MatchRate({
    matched,
    unmatched,
    exceptions,
}: {
    matched: number;
    unmatched: number;
    exceptions: number;
}) {
    const rows = [
        { name: "Matched", value: matched },
        { name: "Unmatched", value: unmatched },
        { name: "Exceptions", value: exceptions },
    ];
    const total = matched + unmatched + exceptions;
    const rate = total ? Math.round((matched / total) * 100) : 0;
    return (
        <div className="lift rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">Match rate · latest reconciliation</h2>
            <div className="mt-3 grid items-center gap-4 sm:grid-cols-[180px_1fr]">
                <div className="relative mx-auto size-44">
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie
                                data={rows}
                                dataKey="value"
                                innerRadius="68%"
                                outerRadius="100%"
                                paddingAngle={total > 1 ? 2 : 0}
                                stroke="none"
                                isAnimationActive
                            >
                                {rows.map((r, i) => (
                                    <Cell key={r.name} fill={RATE_COLORS[i]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    background: "var(--popover)",
                                    border: "1px solid var(--border)",
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                        <div>
                            <p className="num text-3xl font-semibold">{rate}%</p>
                            <p className="text-xs text-muted-foreground">matched</p>
                        </div>
                    </div>
                </div>
                <ul className="space-y-2 text-sm">
                    {rows.map((r, i) => (
                        <li key={r.name} className="flex items-center gap-2">
                            <span
                                className="size-2.5 rounded-full"
                                style={{ background: RATE_COLORS[i] }}
                            />
                            {r.name}
                            <span className="num ml-auto font-medium">{r.value}</span>
                        </li>
                    ))}
                    <li className="border-t pt-2 text-xs text-muted-foreground">
                        {total} records in the latest run
                    </li>
                </ul>
            </div>
        </div>
    );
}
