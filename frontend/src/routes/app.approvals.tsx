import { LiveApprovals } from "@/components/finsight/live/approvals";
import { useSession } from "@/components/finsight/session";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { Page, Metrics, Pill, Empty, pageHead } from "@/components/finsight/page-kit";
import type { Approval } from "@/lib/workspace";
export const Route = createFileRoute("/app/approvals")({
    head: () =>
        pageHead(
            "Approvals",
            "Review sample write-offs and adjustment requests in the FinSight sandbox.",
        ),
    component: ApprovalsPage,
});
function SampleApprovals() {
    const { approvals, setApprovals, log, money } = useWorkspace();
    const [filter, setFilter] = useState("Pending"),
        [notes, setNotes] = useState<Record<string, string>>({});
    function decide(id: string, status: Approval["status"]) {
        const note = notes[id]?.trim() ?? "";
        setApprovals((xs) => xs.map((a) => (a.id === id ? { ...a, status, note } : a)));
        log(
            `Request ${status.toLowerCase()}`,
            id,
            note || "Sandbox decision recorded; no accounting entry posted.",
        );
    }
    const visible = approvals.filter((a) => filter === "All" || a.status === filter);
    return (
        <Page title="Approvals" subtitle="Sandbox decisions · no accounting entries are posted">
            <Metrics
                items={[
                    {
                        label: "Pending",
                        value: String(approvals.filter((a) => a.status === "Pending").length),
                    },
                    {
                        label: "Approved",
                        value: String(approvals.filter((a) => a.status === "Approved").length),
                    },
                    {
                        label: "Rejected",
                        value: String(approvals.filter((a) => a.status === "Rejected").length),
                    },
                    { label: "Environment", value: "Demo review" },
                ]}
            />
            <div className="flex flex-wrap gap-2">
                {["Pending", "Approved", "Rejected", "All"].map((f) => (
                    <Button
                        key={f}
                        variant={filter === f ? "secondary" : "ghost"}
                        onClick={() => setFilter(f)}
                    >
                        {f}
                    </Button>
                ))}
            </div>
            <div className="space-y-4">
                {visible.map((a) => (
                    <article key={a.id} className="lift rounded-lg border bg-card p-5">
                        <div className="flex flex-wrap justify-between gap-3">
                            <div>
                                <h2 className="font-medium">{a.counterparty}</h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {a.id} · requested by {a.maker}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="num font-semibold">{money(a.amount, a.currency)}</p>
                                <Pill
                                    tone={
                                        a.status === "Pending"
                                            ? "warning"
                                            : a.status === "Approved"
                                              ? "success"
                                              : "danger"
                                    }
                                >
                                    {a.status}
                                </Pill>
                            </div>
                        </div>
                        <p className="mt-4 text-sm">{a.reason}</p>
                        {a.status === "Pending" ? (
                            <div className="mt-4 max-w-2xl space-y-3">
                                <Textarea
                                    aria-label={`Decision note for ${a.id}`}
                                    placeholder="Decision note (required for rejection)"
                                    value={notes[a.id] ?? ""}
                                    onChange={(e) =>
                                        setNotes((xs) => ({ ...xs, [a.id]: e.target.value }))
                                    }
                                />
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={() => decide(a.id, "Approved")}>
                                        <Check />
                                        Approve
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!notes[a.id]?.trim()}
                                        onClick={() => decide(a.id, "Rejected")}
                                    >
                                        <X />
                                        Reject
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-muted-foreground">
                                {a.note || "No note recorded."}
                            </p>
                        )}
                    </article>
                ))}
            </div>
            {!visible.length && <Empty>No requests in this view.</Empty>}
        </Page>
    );
}

function ApprovalsPage() {
    const { isLive } = useSession();
    return isLive ? <LiveApprovals /> : <SampleApprovals />;
}
