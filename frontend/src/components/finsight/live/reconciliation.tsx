import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Check,
    X,
    Sparkles,
    ArrowRight,
    Keyboard,
    GitMerge,
    Download,
    Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, type MatchOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { csvString, downloadFile } from "@/lib/workspace";
import { ApiGap, ErrorLine, Pill, SourceBadge, RichAnswer } from "@/components/finsight/page-kit";
import {
    type RecordInfo,
    useLatestRun,
    minorText,
    pct,
    recordLabel,
    shortId,
    useRecordInfo,
} from "./common";

export function LiveReconciliation() {
    const queryClient = useQueryClient();
    const { runId, setRunId, summary } = useLatestRun();
    const [idx, setIdx] = useState(0);
    const [answer, setAnswer] = useState<Record<string, string>>({});

    const runQuery = useQuery({
        queryKey: ["run", runId],
        queryFn: () => api.run(runId as string),
        enabled: !!runId,
    });
    const queue = useQuery({
        queryKey: ["matches", runId, "pending"],
        queryFn: () => api.matches(runId as string, "pending"),
        enabled: !!runId,
    });
    const items = queue.data ?? [];
    const info = useRecordInfo([
        ...items.flatMap((m) => [m.payment_id, ...m.invoice_ids]),
        ...(runQuery.data?.unmatched_items.map((u) => u.record_id) ?? []),
    ]);
    const cur: MatchOut | undefined = items[Math.min(idx, Math.max(0, items.length - 1))];

    const refresh = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ["matches", runId] });
        void queryClient.invalidateQueries({ queryKey: ["run", runId] });
        void queryClient.invalidateQueries({ queryKey: ["summary"] });
    }, [queryClient, runId]);

    const runNew = useMutation({
        mutationFn: () => api.runReconciliation(),
        onSuccess: (r) => {
            setRunId(r.run_id);
            setIdx(0);
            toast.success(`Run complete · ${r.matched} matched · ${r.unmatched} unmatched`);
            void queryClient.invalidateQueries({ queryKey: ["summary"] });
        },
    });
    const review = useMutation({
        mutationFn: (v: {
            id: string;
            decision: "accept" | "reject" | "correct";
            invoice?: string;
        }) => api.review(v.id, v.decision, v.invoice),
        onSuccess: (m) => {
            toast(`Match ${m.status}`);
            refresh();
        },
    });
    const bulk = useMutation({
        mutationFn: async () => {
            const targets = items.filter((m) => m.confidence >= 0.85);
            for (const m of targets) await api.review(m.id, "accept");
            return targets.length;
        },
        onSuccess: (n) => {
            toast.success(`Accepted ${n} matches ≥ 85%`);
            setIdx(0);
            refresh();
        },
    });
    const explain = useMutation({
        mutationFn: (m: MatchOut) => api.explain("this match", runId ?? undefined, m.id),
        onSuccess: (a, m) => setAnswer((x) => ({ ...x, [m.id]: a.answer })),
    });

    const decide = useCallback(
        (decision: "accept" | "reject") => {
            if (cur && !review.isPending) review.mutate({ id: cur.id, decision });
        },
        [cur, review],
    );

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === "INPUT" || e.metaKey || e.ctrlKey) return;
            const k = e.key.toLowerCase();
            if (k === "a") decide("accept");
            else if (k === "r") decide("reject");
            else if (k === "j") setIdx((i) => Math.min(i + 1, items.length - 1));
            else if (k === "k") setIdx((i) => Math.max(i - 1, 0));
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [decide, items.length]);

    const run = runQuery.data;
    function exportRun() {
        if (!run) return;
        const rows = [
            ...run.matches.map((m) => ({
                kind: "match",
                id: m.id,
                payment_id: m.payment_id,
                invoice_ids: m.invoice_ids.join(" "),
                match_type: m.match_type,
                confidence: m.confidence,
                amount_applied: minorText(m.amount_applied_minor),
                residual: minorText(m.residual_minor),
                status: m.status,
                explanation: m.explanation,
            })),
            ...run.unmatched_items.map((u) => ({
                kind: `unmatched ${u.side}`,
                id: u.record_id,
                payment_id: "",
                invoice_ids: "",
                match_type: "",
                confidence: "",
                amount_applied: "",
                residual: "",
                status: "unmatched",
                explanation: u.reason,
            })),
        ];
        downloadFile(`finsight-run-${run.run_id}.csv`, csvString(rows));
    }

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                        Review queue <SourceBadge live />
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {run
                            ? `Run ${shortId(run.run_id)} · ${run.matched} matched · ${items.length} to review · ${run.unmatched} unmatched · ${run.exceptions} exceptions`
                            : runId
                              ? "Loading run…"
                              : "No reconciliation run yet"}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!items.some((m) => m.confidence >= 0.85) || bulk.isPending}
                        onClick={() => bulk.mutate()}
                    >
                        {bulk.isPending && <Loader2 className="animate-spin" />}Bulk-accept ≥ 85%
                    </Button>
                    <Button variant="outline" size="sm" disabled={!run} onClick={exportRun}>
                        <Download />
                        Export run
                    </Button>
                    <Button size="sm" disabled={runNew.isPending} onClick={() => runNew.mutate()}>
                        {runNew.isPending ? <Loader2 className="animate-spin" /> : <GitMerge />}Run
                        reconciliation
                    </Button>
                </div>
            </div>
            <ErrorLine
                error={
                    runNew.error ??
                    review.error ??
                    bulk.error ??
                    queue.error ??
                    runQuery.error ??
                    summary.error
                }
            />

            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <ul className="space-y-1.5">
                    {items.map((it, i) => (
                        <li key={it.id}>
                            <button
                                onClick={() => setIdx(i)}
                                className={cn(
                                    "w-full rounded-lg border bg-card p-3 text-left text-sm transition hover:bg-muted",
                                    it.id === cur?.id && "border-primary ring-1 ring-primary",
                                )}
                            >
                                <div className="flex justify-between gap-2">
                                    <span className="truncate font-medium" title={it.payment_id}>
                                        {recordLabel(info[it.payment_id], it.payment_id)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {it.match_type}
                                    </span>
                                </div>
                                <div className="num mt-1 text-right">
                                    {minorText(
                                        it.amount_applied_minor,
                                        info[it.payment_id]?.currency,
                                    )}
                                </div>
                                <ConfidenceBar value={it.confidence} />
                            </button>
                        </li>
                    ))}
                    {runId && !queue.isPending && items.length === 0 && (
                        <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                            Nothing waiting for review in this run.
                        </li>
                    )}
                    {!runId && (
                        <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                            Upload data, then run a reconciliation.
                        </li>
                    )}
                </ul>

                {cur && (
                    <div className="rounded-lg border bg-card">
                        <div className="grid gap-px bg-border md:grid-cols-[1fr_auto_1fr]">
                            <div className="bg-card p-5">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Payment
                                </p>
                                <RecordFacts id={cur.payment_id} info={info[cur.payment_id]} />
                                <p className="num mt-2 text-2xl font-semibold">
                                    {minorText(
                                        cur.amount_applied_minor,
                                        info[cur.payment_id]?.currency,
                                    )}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">amount applied</p>
                            </div>
                            <div className="hidden place-items-center bg-card px-2 md:grid">
                                <ArrowRight className="text-muted-foreground" />
                            </div>
                            <div className="bg-card p-5">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Proposed invoice{cur.invoice_ids.length > 1 && "s"}
                                </p>
                                {cur.invoice_ids.map((inv) => (
                                    <RecordFacts key={inv} id={inv} info={info[inv]} />
                                ))}
                                <p className="mt-3 flex justify-between border-t pt-2 text-sm">
                                    <span className="text-muted-foreground">Residual</span>
                                    <span
                                        className={cn(
                                            "num font-medium",
                                            cur.residual_minor === 0
                                                ? "text-success"
                                                : "text-warning",
                                        )}
                                    >
                                        {minorText(
                                            cur.residual_minor,
                                            info[cur.payment_id]?.currency,
                                        )}
                                    </span>
                                </p>
                            </div>
                        </div>
                        <div className="space-y-4 p-5">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium capitalize">
                                    {cur.match_type} match
                                </span>
                                <div className="flex-1">
                                    <ConfidenceBar value={cur.confidence} />
                                </div>
                            </div>
                            {cur.exceptions.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {cur.exceptions.map((x) => (
                                        <Pill key={x} tone="warning">
                                            {x}
                                        </Pill>
                                    ))}
                                </div>
                            )}
                            <p className="rounded-md bg-accent/50 p-3 text-sm">
                                <Sparkles className="mr-1 inline size-4 text-accent-foreground" />
                                {cur.explanation}
                            </p>
                            {answer[cur.id] && (
                                <div className="animate-in fade-in-0 slide-in-from-top-1 rounded-lg border border-primary/20 bg-primary/5 p-4 duration-300">
                                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
                                        <Sparkles className="size-3.5" />
                                        AI explanation
                                    </p>
                                    <RichAnswer text={answer[cur.id] ?? ""} />
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    disabled={review.isPending}
                                    onClick={() => decide("accept")}
                                    className="bg-success text-primary-foreground hover:bg-success/90"
                                >
                                    <Check /> Accept <kbd className="text-xs opacity-70">A</kbd>
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={review.isPending}
                                    onClick={() => decide("reject")}
                                >
                                    <X /> Reject <kbd className="text-xs opacity-70">R</kbd>
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={review.isPending}
                                    onClick={() => {
                                        const inv = window.prompt(
                                            "Correct invoice ID",
                                            cur.invoice_ids[0] ?? "",
                                        );
                                        if (inv?.trim())
                                            review.mutate({
                                                id: cur.id,
                                                decision: "correct",
                                                invoice: inv.trim(),
                                            });
                                    }}
                                >
                                    Correct
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={explain.isPending}
                                    onClick={() => explain.mutate(cur)}
                                >
                                    {explain.isPending ? (
                                        <Loader2 className="animate-spin" />
                                    ) : (
                                        <Sparkles />
                                    )}
                                    Explain with AI
                                </Button>
                                <Button
                                    variant="ghost"
                                    disabled
                                    title="Not available in the API yet"
                                >
                                    Mark as fee
                                </Button>
                                <Button
                                    variant="ghost"
                                    disabled
                                    title="Not available in the API yet"
                                >
                                    Write off
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

            {run && run.unmatched_items.length > 0 && (
                <div className="rounded-lg border bg-card">
                    <h2 className="border-b px-4 py-3 text-sm font-medium">
                        Unmatched in this run
                    </h2>
                    <ul className="divide-y text-sm">
                        {run.unmatched_items.map((u) => (
                            <li
                                key={`${u.side}-${u.record_id}`}
                                className="flex flex-wrap justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-muted/40"
                            >
                                <span className="flex items-center gap-2">
                                    <Pill tone="warning">{u.side}</Pill>
                                    <span title={u.record_id}>
                                        {recordLabel(info[u.record_id], u.record_id)}
                                    </span>
                                    {info[u.record_id]?.amountMinor != null && (
                                        <span className="num font-medium">
                                            {minorText(
                                                info[u.record_id]!.amountMinor!,
                                                info[u.record_id]?.currency,
                                            )}
                                        </span>
                                    )}
                                </span>
                                <span className="text-muted-foreground">{u.reason}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <ApiGap needs="match detail (payment/invoice records, currency, signals), decisions: fee | write_off | split, GET /v1/reconciliation/runs">
                Matches show IDs and amounts only: the API doesn't return the matched records, their
                currency or the signal breakdown yet. Fee and write-off decisions also aren't
                available.
            </ApiGap>
        </div>
    );
}

function RecordFacts({ id, info }: { id: string; info: RecordInfo | undefined }) {
    if (!info)
        return (
            <p className="mt-2 h-10 animate-pulse rounded bg-muted" aria-label="Loading record" />
        );
    return (
        <div className="mt-2 space-y-0.5" title={id}>
            <p className="font-medium">{info.counterparty ?? info.description ?? shortId(id)}</p>
            <p className="text-xs text-muted-foreground">
                {[info.reference, info.date && new Date(info.date).toLocaleDateString()]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
        </div>
    );
}

function ConfidenceBar({ value }: { value: number }) {
    const v = Math.round(value * 100);
    const tone = v >= 85 ? "bg-success" : v >= 70 ? "bg-warning" : "bg-danger";
    return (
        <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full", tone)} style={{ width: `${v}%` }} />
            </div>
            <span className="num text-xs text-muted-foreground">{pct(value)}</span>
        </div>
    );
}
