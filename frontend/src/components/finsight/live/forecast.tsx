import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatAmount, fromApiMinor, toApiMinor } from "@/lib/money";
import {
    ApiGap,
    ErrorLine,
    Metrics,
    Page,
    Pill,
    SourceBadge,
} from "@/components/finsight/page-kit";

export function LiveForecast() {
    const [currency, setCurrency] = useState("RWF");
    const [opening, setOpening] = useState(184_250_000);
    const [inflow, setInflow] = useState(45_000_000);
    const [outflow, setOutflow] = useState(39_000_000);
    const [weeks, setWeeks] = useState(8);
    const [adjust, setAdjust] = useState(0);
    // The API takes totals over the horizon; the form uses weekly amounts.
    const body = {
        opening_balance_minor: toApiMinor(opening),
        horizon_days: weeks * 7,
        expected_inflows_minor: toApiMinor(inflow * (1 + adjust / 100) * weeks),
        expected_outflows_minor: toApiMinor(outflow * weeks),
        currency,
    };
    const forecast = useQuery({
        queryKey: ["forecast", body],
        queryFn: () => api.forecast(body),
        placeholderData: (prev) => prev,
    });
    const points = (forecast.data?.points ?? [])
        .filter((_, i) => (i + 1) % 7 === 0)
        .map((p, i) => ({
            week: `Week ${i + 1}`,
            balance: fromApiMinor(p.projected_balance_minor),
        }));
    const last = points.at(-1)?.balance ?? opening;
    const lowest = Math.min(opening, ...points.map((p) => p.balance));
    const money = (n: number) => formatAmount(n, currency);
    const num = (label: string, value: number, set: (n: number) => void) => (
        <label className="block text-xs text-muted-foreground">
            {label}
            <Input
                className="num mt-2"
                type="number"
                min={0}
                value={value}
                onChange={(e) => set(Math.max(0, Number(e.target.value)))}
            />
        </label>
    );
    return (
        <Page
            title="Forecast"
            subtitle={`Cash projection from the forecast service · ${currency}`}
            actions={
                <>
                    <SourceBadge live />
                    {forecast.data && (
                        <Pill tone={forecast.data.risk === "high" ? "danger" : "success"}>
                            risk: {forecast.data.risk}
                        </Pill>
                    )}
                </>
            }
        >
            <Metrics
                items={[
                    { label: "Opening cash", value: money(opening) },
                    { label: `Week ${weeks} closing`, value: money(last) },
                    { label: "Lowest cash", value: money(lowest) },
                    {
                        label: "Weekly net change",
                        value: money(inflow * (1 + adjust / 100) - outflow),
                    },
                ]}
            />
            <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
                <section className="space-y-5">
                    <h2 className="text-sm font-medium">Assumptions</h2>
                    <label className="block text-xs text-muted-foreground">
                        Currency
                        <select
                            className="mt-2 w-full rounded-md border bg-background px-2 py-2 text-sm"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                        >
                            {["RWF", "USD", "EUR", "KES", "UGX"].map((c) => (
                                <option key={c}>{c}</option>
                            ))}
                        </select>
                    </label>
                    {num("Opening cash", opening, setOpening)}
                    {num("Weekly inflow", inflow, setInflow)}
                    {num("Weekly outflow", outflow, setOutflow)}
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
                </section>
                <section className="min-w-0">
                    <ErrorLine error={forecast.error} />
                    <div className="h-80">
                        <ResponsiveContainer>
                            <LineChart data={points}>
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
                                    formatter={(v) => money(Number(v))}
                                    contentStyle={{
                                        background: "var(--popover)",
                                        border: "1px solid var(--border)",
                                    }}
                                />
                                <Line
                                    name="Projected balance"
                                    dataKey="balance"
                                    stroke="var(--primary)"
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            </div>
            <ApiGap needs="forecast from actual cash data, confidence bands, POST /v1/simulate scenarios">
                The forecast service is a naive linear projection of the figures you enter; it
                doesn't yet read your real balances or model scenarios.
            </ApiGap>
        </Page>
    );
}
