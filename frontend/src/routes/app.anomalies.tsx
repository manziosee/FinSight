import { LiveAnomalies } from "@/components/finsight/live/anomalies";
import { useSession } from "@/components/finsight/session";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { Page, Metrics, Pill, Empty, pageHead } from "@/components/finsight/page-kit";
import type { Anomaly } from "@/lib/workspace";
export const Route = createFileRoute("/app/anomalies")({
    head: () =>
        pageHead(
            "Anomalies",
            "Investigate sample duplicate payments, unmatched credits and currency shortfalls.",
        ),
    component: AnomaliesPage,
});
function SampleAnomalies() {
    const { anomalies, setAnomalies, log, money } = useWorkspace();
    const [filter, setFilter] = useState("Active");
    const visible = anomalies.filter(
        (a) =>
            filter === "All" ||
            (filter === "Active"
                ? a.status === "Open" || a.status === "Investigating"
                : a.status === filter),
    );
    function update(id: string, status: Anomaly["status"]) {
        setAnomalies((xs) => xs.map((a) => (a.id === id ? { ...a, status } : a)));
        log(`Anomaly ${status.toLowerCase()}`, id, "Sandbox investigation status updated.");
    }
    return (
        <Page title="Anomalies" subtitle="Sample findings · ranked by severity">
            <Metrics
                items={[
                    {
                        label: "Open",
                        value: String(anomalies.filter((a) => a.status === "Open").length),
                    },
                    {
                        label: "High severity",
                        value: String(
                            anomalies.filter(
                                (a) =>
                                    a.severity === "High" &&
                                    a.status !== "Resolved" &&
                                    a.status !== "Dismissed",
                            ).length,
                        ),
                    },
                    {
                        label: "Investigating",
                        value: String(anomalies.filter((a) => a.status === "Investigating").length),
                    },
                    {
                        label: "Resolved",
                        value: String(anomalies.filter((a) => a.status === "Resolved").length),
                    },
                ]}
            />
            <div className="flex flex-wrap gap-2">
                {["Active", "All", "Resolved", "Dismissed"].map((f) => (
                    <Button
                        key={f}
                        variant={filter === f ? "secondary" : "ghost"}
                        onClick={() => setFilter(f)}
                    >
                        {f}
                    </Button>
                ))}
            </div>
            <div className="space-y-3">
                {visible.map((a) => (
                    <article key={a.id} className="lift rounded-lg border bg-card p-5">
                        <div className="flex flex-wrap justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <AlertTriangle
                                    className={`mt-1 size-5 ${a.severity === "High" ? "text-danger" : "text-warning"}`}
                                />
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="font-medium">{a.title}</h2>
                                        <Pill tone={a.severity === "High" ? "danger" : "warning"}>
                                            {a.severity}
                                        </Pill>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {a.id} · {a.counterparty}
                                    </p>
                                </div>
                            </div>
                            <p className="num font-semibold">{money(a.amount, a.currency)}</p>
                        </div>
                        <p className="mt-4 max-w-3xl text-sm leading-relaxed">{a.detail}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Pill>{a.status}</Pill>
                            {(a.status === "Open" || a.status === "Investigating") && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={a.status === "Investigating"}
                                        onClick={() => update(a.id, "Investigating")}
                                    >
                                        Investigate
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => update(a.id, "Resolved")}
                                    >
                                        Resolve
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => update(a.id, "Dismissed")}
                                    >
                                        Dismiss
                                    </Button>
                                </>
                            )}
                            <Button asChild size="sm" variant="link">
                                <Link to="/app/reconciliation">
                                    Review evidence
                                    <ArrowUpRight />
                                </Link>
                            </Button>
                        </div>
                    </article>
                ))}
            </div>
            {!visible.length && <Empty>No findings in this view.</Empty>}
        </Page>
    );
}

function AnomaliesPage() {
    const { isLive } = useSession();
    return isLive ? <LiveAnomalies /> : <SampleAnomalies />;
}
