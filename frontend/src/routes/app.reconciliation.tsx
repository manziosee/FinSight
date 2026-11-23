import { LiveReconciliation } from "@/components/finsight/live/reconciliation";
import { useSession } from "@/components/finsight/session";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Check, X, Sparkles, ArrowRight, Keyboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reviewQueue, type ReviewItem } from "@/lib/demo-data";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { cn } from "@/lib/utils";
import { pageHead } from "@/components/finsight/page-kit";

export const Route = createFileRoute("/app/reconciliation")({
    head: () =>
        pageHead("Reconciliation", "Review proposed matches between payments and invoices."),
    component: ReconciliationPage,
});

function SampleReconciliation() {
    const { money, log, setApprovals } = useWorkspace();
    const [items, setItems] = useState<ReviewItem[]>(reviewQueue);
    const [idx, setIdx] = useState(0);
    const cur = items[idx];

    const decide = useCallback(
        (accept: boolean) => {
            if (!cur) return;
            log(accept ? "Match accepted" : "Match rejected", cur.id, cur.payment.counterparty);
            toast(
                accept
                    ? `Accepted match for ${cur.payment.counterparty}`
                    : `Rejected match for ${cur.payment.counterparty}`,
            );
            setItems((xs) => xs.filter((x) => x.id !== cur.id));
            setIdx((i) => Math.max(0, Math.min(i, items.length - 2)));
        },
        [cur, items.length, log],
    );

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === "INPUT" || e.metaKey || e.ctrlKey) return;
            const k = e.key.toLowerCase();
            if (k === "a") decide(true);
            else if (k === "r") decide(false);
            else if (k === "j") setIdx((i) => Math.min(i + 1, items.length - 1));
            else if (k === "k") setIdx((i) => Math.max(i - 1, 0));
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [decide, items.length]);

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
                    <p className="text-sm text-muted-foreground">
                        Run Oct 2026 · 1,284 matched · {items.length} to review · 7 exceptions
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            const n = items.filter((i) => i.confidence >= 85).length;
                            setItems((x) => x.filter((i) => i.confidence < 85));
                            setIdx(0);
                            toast(`Bulk-accepted ${n} matches ≥ 85%`);
                        }}
                    >
                        Bulk-accept ≥ 85%
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => {
                            setItems(reviewQueue);
                            setIdx(0);
                            log(
                                "Sample review restarted",
                                "Reconciliation",
                                "Sample queue restored; no automatic matching of uploads.",
                            );
                            toast("Sample queue restored");
                        }}
                    >
                        Restart sample review
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <ul className="space-y-1.5">
                    {items.map((it, i) => (
                        <li key={it.id}>
                            <button
                                onClick={() => setIdx(i)}
                                className={cn(
                                    "w-full rounded-lg border bg-card p-3 text-left text-sm transition hover:bg-muted",
                                    i === idx && "border-primary ring-1 ring-primary",
                                )}
                            >
                                <div className="flex justify-between">
                                    <span className="font-medium">{it.payment.counterparty}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {it.matchType}
                                    </span>
                                </div>
                                <div className="num mt-1 text-right">
                                    {money(it.payment.amount, it.payment.currency)}
                                </div>
                                <ConfidenceBar value={it.confidence} />
                            </button>
                        </li>
                    ))}
                    {items.length === 0 && (
                        <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                            Queue cleared. New items appear after the next sync.
                        </li>
                    )}
                </ul>

                {cur && (
                    <div className="rounded-lg border bg-card">
                        <div className="grid gap-px bg-border md:grid-cols-[1fr_auto_1fr]">
                            <div className="bg-card p-5">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Payment · {cur.payment.source}
                                </p>
                                <p className="mt-2 font-medium">{cur.payment.counterparty}</p>
                                <p className="num mt-1 text-2xl font-semibold">
                                    {money(cur.payment.amount, cur.payment.currency)}
                                </p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {cur.payment.date} · {cur.payment.ref}
                                </p>
                            </div>
                            <div className="hidden place-items-center bg-card px-2 md:grid">
                                <ArrowRight className="text-muted-foreground" />
                            </div>
                            <div className="bg-card p-5">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Proposed invoice{cur.invoices.length > 1 && "s"}
                                </p>
                                {cur.invoices.map((inv) => (
                                    <div key={inv.no} className="mt-2 flex justify-between text-sm">
                                        <span>
                                            {inv.no}{" "}
                                            <span className="text-muted-foreground">
                                                · {inv.date}
                                            </span>
                                        </span>
                                        <span className="num font-medium">
                                            {money(inv.amount, "RWF")}
                                        </span>
                                    </div>
                                ))}
                                <p className="mt-3 flex justify-between border-t pt-2 text-sm">
                                    <span className="text-muted-foreground">Residual</span>
                                    <span
                                        className={cn(
                                            "num font-medium",
                                            cur.residual === 0 ? "text-success" : "text-warning",
                                        )}
                                    >
                                        {money(cur.residual, "RWF")}
                                    </span>
                                </p>
                            </div>
                        </div>
                        <div className="space-y-4 p-5">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium">{cur.matchType} match</span>
                                <div className="flex-1">
                                    <ConfidenceBar value={cur.confidence} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                {cur.signals.map((s) => (
                                    <div key={s.label} className="rounded-md border p-2.5 text-sm">
                                        <p className="text-xs text-muted-foreground">{s.label}</p>
                                        <p
                                            className={cn(
                                                "mt-0.5 flex items-center gap-1 font-medium",
                                                s.ok ? "text-success" : "text-warning",
                                            )}
                                        >
                                            {s.ok ? (
                                                <Check className="size-3.5" />
                                            ) : (
                                                <span aria-hidden>◐</span>
                                            )}
                                            {s.value}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            <p className="rounded-md bg-accent/50 p-3 text-sm">
                                <Sparkles className="mr-1 inline size-4 text-accent-foreground" />
                                Original evidence: {cur.explanation}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    onClick={() => decide(true)}
                                    className="bg-success text-primary-foreground hover:bg-success/90"
                                >
                                    <Check /> Accept <kbd className="text-xs opacity-70">A</kbd>
                                </Button>
                                <Button variant="outline" onClick={() => decide(false)}>
                                    <X /> Reject <kbd className="text-xs opacity-70">R</kbd>
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const no = window.prompt(
                                            "Correct invoice reference",
                                            cur.invoices[0]?.no ?? "",
                                        );
                                        if (!no?.trim()) return;
                                        setItems((xs) =>
                                            xs.map((x) =>
                                                x.id === cur.id
                                                    ? {
                                                          ...x,
                                                          invoices: x.invoices.map((inv, i) =>
                                                              i === 0
                                                                  ? { ...inv, no: no.trim() }
                                                                  : inv,
                                                          ),
                                                      }
                                                    : x,
                                            ),
                                        );
                                        log("Match corrected", cur.id, no.trim());
                                    }}
                                >
                                    Correct
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        log(
                                            "Fee classification",
                                            cur.id,
                                            "Sample residual classified as fee",
                                        );
                                        decide(true);
                                    }}
                                >
                                    Mark as fee
                                </Button>
                                <Button
                                    variant="ghost"
                                    disabled={cur.residual === 0}
                                    onClick={() => {
                                        const id = crypto.randomUUID();
                                        setApprovals((xs) => [
                                            {
                                                id,
                                                counterparty: cur.payment.counterparty,
                                                amount: Math.abs(cur.residual),
                                                currency: "RWF",
                                                reason: `Write-off request · ${cur.id}`,
                                                maker: "Demo user",
                                                status: "Pending",
                                                note: "",
                                            },
                                            ...xs,
                                        ]);
                                        log("Approval requested", id, cur.payment.counterparty);
                                        toast("Write-off added to Approvals");
                                    }}
                                >
                                    Write off (needs approval)
                                </Button>
                            </div>
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Keyboard className="size-3.5" /> A accept · R reject · J/K
                                next/previous
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function ConfidenceBar({ value }: { value: number }) {
    const tone = value >= 85 ? "bg-success" : value >= 70 ? "bg-warning" : "bg-danger";
    return (
        <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full", tone)} style={{ width: `${value}%` }} />
            </div>
            <span className="num text-xs text-muted-foreground">{value}%</span>
        </div>
    );
}

function ReconciliationPage() {
    const { isLive } = useSession();
    return isLive ? <LiveReconciliation /> : <SampleReconciliation />;
}
