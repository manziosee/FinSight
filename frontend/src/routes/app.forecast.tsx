import { LiveForecast } from "@/components/finsight/live/forecast";
import { useSession } from "@/components/finsight/session";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Page, Metrics, DataTable, pageHead, cell } from "@/components/finsight/page-kit";
import { csvString, downloadFile, forecastCash } from "@/lib/workspace";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { convertMoney, displayProjection } from "@/lib/currency-display";
export const Route = createFileRoute("/app/forecast")({
    head: () =>
        pageHead(
            "Forecast",
            "Model sample RWF cash scenarios with adjustable inflows, outflows and forecast horizons.",
        ),
    component: ForecastPage,
});
function SampleForecast() {
    const { money, convert, settings } = useWorkspace();
    const [opening, setOpening] = useState(184250000),
        [inflow, setInflow] = useState(45000000),
        [outflow, setOutflow] = useState(39000000),
        [weeks, setWeeks] = useState(8),
        [adjust, setAdjust] = useState(0);
    const rows = forecastCash(opening, inflow, outflow, weeks, adjust);
    const chartRows = rows.map((r) => ({
        ...r,
        balance: convert(r.balance, "RWF"),
        baseline: convert(r.baseline, "RWF"),
    }));
    const last = rows.at(-1);
    const min = Math.min(...rows.map((r) => r.balance));
    return (
        <Page
            title="Forecast"
            subtitle={`${settings.currency} scenario model · illustrative exchange rates`}
            actions={
                <Button
                    variant="outline"
                    onClick={() =>
                        downloadFile(
                            `cash-forecast-${settings.currency}.csv`,
                            csvString(
                                rows.map((r) => ({
                                    ...r,
                                    source_currency: "RWF",
                                    ...displayProjection(r.balance, "RWF", settings.currency),
                                    display_baseline: convert(r.baseline, "RWF"),
                                })),
                            ),
                        )
                    }
                >
                    <Download />
                    Export forecast
                </Button>
            }
        >
            <Metrics
                items={[
                    { label: "Opening cash", value: money(opening, "RWF") },
                    {
                        label: `Week ${weeks} closing`,
                        value: money(last?.balance ?? opening, "RWF"),
                    },
                    { label: "Lowest cash", value: money(min, "RWF") },
                    {
                        label: "Weekly net change",
                        value: money(inflow * (1 + adjust / 100) - outflow, "RWF"),
                    },
                ]}
            />
            <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
                <section className="space-y-5">
                    <h2 className="text-sm font-medium">Scenario assumptions</h2>
                    {[
                        {
                            label: `Opening cash (${settings.currency})`,
                            value: opening,
                            set: setOpening,
                        },
                        {
                            label: `Weekly inflow (${settings.currency})`,
                            value: inflow,
                            set: setInflow,
                        },
                        {
                            label: `Weekly outflow (${settings.currency})`,
                            value: outflow,
                            set: setOutflow,
                        },
                    ].map((f) => (
                        <label className="block text-xs text-muted-foreground" key={f.label}>
                            {f.label}
                            <Input
                                className="num mt-2"
                                type="number"
                                min={0}
                                value={Number(convert(f.value, "RWF").toFixed(2))}
                                onChange={(e) =>
                                    f.set(
                                        convertMoney(
                                            Math.max(0, Number(e.target.value)),
                                            settings.currency,
                                            "RWF",
                                        ),
                                    )
                                }
                            />
                        </label>
                    ))}
                    <div className="flex gap-1">
                        {[4, 8, 12].map((w) => (
                            <Button
                                key={w}
                                size="sm"
                                variant={weeks === w ? "secondary" : "ghost"}
                                onClick={() => setWeeks(w)}
                            >
                                {w} weeks
                            </Button>
                        ))}
                    </div>
                    <label className="block text-xs text-muted-foreground">
                        Inflow adjustment: {adjust}%
                    </label>
                    <Slider
                        aria-label="Inflow adjustment"
                        min={-30}
                        max={30}
                        step={5}
                        value={[adjust]}
                        onValueChange={(v) => setAdjust(v[0] ?? 0)}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setOpening(184250000);
                            setInflow(45000000);
                            setOutflow(39000000);
                            setAdjust(0);
                            setWeeks(8);
                        }}
                    >
                        Reset assumptions
                    </Button>
                </section>
                <section className="min-w-0">
                    <h2 className="mb-4 text-sm font-medium">Cash balance · {settings.currency}</h2>
                    <div className="h-80">
                        <ResponsiveContainer>
                            <LineChart data={chartRows}>
                                <CartesianGrid vertical={false} stroke="var(--border)" />
                                <XAxis
                                    dataKey="week"
                                    fontSize={11}
                                    stroke="var(--muted-foreground)"
                                />
                                <YAxis
                                    tickFormatter={(n) =>
                                        Intl.NumberFormat("en", { notation: "compact" }).format(n)
                                    }
                                    width={60}
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
                                <Legend />
                                <Line
                                    name="Scenario"
                                    dataKey="balance"
                                    stroke="var(--primary)"
                                    strokeWidth={2}
                                    dot={false}
                                />
                                <Line
                                    name="Baseline"
                                    dataKey="baseline"
                                    stroke="var(--chart-3)"
                                    strokeDasharray="5 5"
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            </div>
            {min < 0 && (
                <p role="alert" className="bg-danger-soft p-3 text-sm text-danger">
                    Cash falls below zero in this scenario.
                </p>
            )}
            <DataTable headers={["Period", "Scenario balance", "Baseline", "Difference"]}>
                {rows.map((r) => (
                    <tr key={r.week}>
                        <td className={cell}>{r.week}</td>
                        <td className={`${cell} num`}>{money(r.balance, "RWF")}</td>
                        <td className={`${cell} num`}>{money(r.baseline, "RWF")}</td>
                        <td className={`${cell} num`}>{money(r.balance - r.baseline, "RWF")}</td>
                    </tr>
                ))}
            </DataTable>
        </Page>
    );
}

function ForecastPage() {
    const { isLive } = useSession();
    return isLive ? <LiveForecast /> : <SampleForecast />;
}
