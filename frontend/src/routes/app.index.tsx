import { LiveDashboard } from "@/components/finsight/live/dashboard";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { useSession } from "@/components/finsight/session";
import { attention, trend } from "@/lib/demo-data";
import { StatusBadge } from "@/components/finsight/status";
import { pageHead } from "@/components/finsight/page-kit";

export const Route = createFileRoute("/app/")({
    head: () => pageHead("Home", "Cash position, match rate and what needs your attention."),
    component: DashboardPage,
});

function SampleDashboard() {
    const { money, settings, convert } = useWorkspace();
    const { user } = useSession();
    const kpis = [
        { l: "Cash position", v: [money(184250000, "RWF"), money(42310.75, "USD")] },
        { l: "Matched this period", v: ["96.8%"], d: "+2.1 pts" },
        { l: "Unmatched", v: [money(7840000, "RWF"), money(412.5, "USD")] },
        { l: "Open receivables", v: [money(31600000, "RWF")] },
        { l: "Waiting for review", v: ["42"], to: true },
        { l: "New anomalies", v: ["7"] },
    ];
    const cashTrend = trend.map((r) => ({
        ...r,
        inflow: convert(r.inflow * 1000000, "RWF"),
        outflow: convert(r.outflow * 1000000, "RWF"),
    }));
    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                    Welcome, {user?.name ?? "guest"}
                </h1>
                <p className="text-sm text-muted-foreground">October 2026 · fiscal year Jul–Jun</p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                {kpis.map((k) => (
                    <div key={k.l} className="rounded-lg border bg-card p-4">
                        <p className="text-xs text-muted-foreground">{k.l}</p>
                        {k.v.map((v) => (
                            <p
                                key={v}
                                className="num mt-1 text-right text-base font-semibold lg:text-lg"
                            >
                                {v}
                            </p>
                        ))}
                        {k.d && <p className="mt-1 text-right text-xs text-success">{k.d}</p>}
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

            <div className="rounded-lg border bg-accent/40 p-5">
                <p className="flex items-center gap-2 text-sm font-medium text-accent-foreground">
                    <Sparkles className="size-4" /> AI daily brief
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    <li>
                        3 payments from ABC Ltd don't match any invoice ({money(2400000, "RWF")}) —
                        likely a split.{" "}
                        <Link to="/app/reconciliation" className="text-primary underline">
                            Evidence
                        </Link>
                    </li>
                    <li>
                        MoMo fees explain {money(63000, "RWF")} of October's shortfall across 42
                        lines.
                    </li>
                    <li>
                        A possible duplicate payment to Volcano Logistics was flagged overnight.
                    </li>
                </ul>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Matched vs unmatched (records)">
                    <BarChart data={trend}>
                        <CartesianGrid vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="week" fontSize={11} stroke="var(--muted-foreground)" />
                        <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                        <Tooltip
                            contentStyle={{
                                background: "var(--popover)",
                                border: "1px solid var(--border)",
                            }}
                        />
                        <Bar dataKey="matched" stackId="a" fill="var(--success)" />
                        <Bar
                            dataKey="unmatched"
                            stackId="a"
                            fill="var(--warning)"
                            radius={[3, 3, 0, 0]}
                        />
                    </BarChart>
                </ChartCard>
                <ChartCard title={`Inflow vs outflow (${settings.currency})`}>
                    <AreaChart data={cashTrend}>
                        <CartesianGrid vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="week" fontSize={11} stroke="var(--muted-foreground)" />
                        <YAxis
                            tickFormatter={(n) =>
                                Intl.NumberFormat("en", { notation: "compact" }).format(n)
                            }
                            fontSize={11}
                            stroke="var(--muted-foreground)"
                        />
                        <Tooltip
                            formatter={(v) => money(Number(v), settings.currency)}
                            contentStyle={{
                                background: "var(--popover)",
                                border: "1px solid var(--border)",
                            }}
                        />
                        <Area
                            dataKey="inflow"
                            stroke="var(--primary)"
                            fill="var(--primary)"
                            fillOpacity={0.15}
                        />
                        <Area
                            dataKey="outflow"
                            stroke="var(--chart-5)"
                            fill="var(--chart-5)"
                            fillOpacity={0.1}
                        />
                    </AreaChart>
                </ChartCard>
            </div>

            <div className="rounded-lg border bg-card">
                <h2 className="border-b px-4 py-3 text-sm font-medium">
                    Needs your attention · ranked by money at stake
                </h2>
                <ul className="divide-y">
                    {attention.map((a) => (
                        <li
                            key={a.label}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                        >
                            <span className="flex items-center gap-3">
                                <StatusBadge status={a.status} /> {a.label}
                            </span>
                            <span className="num font-medium">{money(a.amount, a.currency)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">{title}</h2>
            <div className="mt-3 h-56">
                <ResponsiveContainer>{children}</ResponsiveContainer>
            </div>
        </div>
    );
}

function DashboardPage() {
    const { isLive } = useSession();
    return isLive ? <LiveDashboard /> : <SampleDashboard />;
}
