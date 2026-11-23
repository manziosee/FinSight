import { LiveTransactions } from "@/components/finsight/live/transactions";
import { useSession } from "@/components/finsight/session";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { type Status, type Txn } from "@/lib/demo-data";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { pageHead } from "@/components/finsight/page-kit";
import { formatMoney, totalsByCurrency, type Currency } from "@/lib/money";
import { StatusBadge } from "@/components/finsight/status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/transactions")({
    head: () =>
        pageHead("Transactions", "Every normalized record across banks, mobile money and ERPs."),
    component: TransactionsPage,
});

function SampleTransactions() {
    const { records: transactions, money, total, settings } = useWorkspace();
    const [q, setQ] = useState("");
    const [status, setStatus] = useState<Status | "all">("all");
    const [sel, setSel] = useState<Txn | null>(null);

    const rows = useMemo(
        () =>
            transactions.filter(
                (t) =>
                    (status === "all" || t.status === status) &&
                    (q === "" ||
                        `${t.counterparty} ${t.reference} ${t.source}`
                            .toLowerCase()
                            .includes(q.toLowerCase())),
            ),
        [q, status, transactions],
    );
    const totals = totalsByCurrency(rows);

    return (
        <div className="mx-auto max-w-7xl space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
                    <p className="text-sm text-muted-foreground">
                        {rows.length} records · converted display · originals in record details
                    </p>
                </div>
                <div className="flex gap-4 text-sm">
                    <span className="num font-medium">{money(total(rows), settings.currency)}</span>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <Input
                    placeholder="Search counterparty, reference, source…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="max-w-xs"
                />
                {(["all", "matched", "review", "exception"] as const).map((s) => (
                    <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={cn(
                            "rounded-md border px-3 text-sm capitalize",
                            status === s ? "bg-foreground text-background" : "hover:bg-muted",
                        )}
                    >
                        {s === "review" ? "Needs review" : s}
                    </button>
                ))}
            </div>

            <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                    <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                            {[
                                "Date",
                                "Source",
                                "Counterparty",
                                "Reference",
                                "Amount",
                                "Confidence",
                                "Status",
                            ].map((h) => (
                                <th
                                    key={h}
                                    className={cn(
                                        "px-3 py-2 text-left font-medium",
                                        (h === "Amount" || h === "Confidence") && "text-right",
                                    )}
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {rows.map((t) => (
                            <tr
                                key={t.id}
                                onClick={() => setSel(t)}
                                className="cursor-pointer hover:bg-muted/50"
                            >
                                <td className="num px-3 py-2 text-muted-foreground">
                                    {t.date.split("-").reverse().join("/")}
                                </td>
                                <td className="px-3 py-2">{t.source}</td>
                                <td className="px-3 py-2 font-medium">{t.counterparty}</td>
                                <td className="px-3 py-2 text-muted-foreground">{t.reference}</td>
                                <td
                                    className={cn(
                                        "num px-3 py-2 text-right font-medium",
                                        t.amount < 0 && "text-danger",
                                    )}
                                >
                                    {money(t.amount, t.currency)}
                                </td>
                                <td className="num px-3 py-2 text-right text-muted-foreground">
                                    {t.confidence}%
                                </td>
                                <td className="px-3 py-2">
                                    <StatusBadge status={t.status} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                        No records match. Try clearing filters or upload a new source.
                    </p>
                )}
            </div>

            <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                    {sel && (
                        <>
                            <SheetHeader>
                                <SheetTitle>
                                    {sel.counterparty} · {sel.id}
                                </SheetTitle>
                            </SheetHeader>
                            <div className="space-y-5 px-4 pb-6">
                                <div className="flex items-center justify-between">
                                    <StatusBadge status={sel.status} />
                                    <span className="num text-2xl font-semibold">
                                        {money(sel.amount, sel.currency)}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="mb-2 text-xs uppercase text-muted-foreground">
                                            Normalized
                                        </p>
                                        <dl className="space-y-1.5 text-sm">
                                            {[
                                                ["Date", sel.date],
                                                ["Reference", sel.reference],
                                                ["Counterparty", sel.counterparty],
                                                ["Source currency", sel.currency],
                                                [
                                                    "Original amount",
                                                    formatMoney(sel.amount, sel.currency),
                                                ],
                                                ["Confidence", `${sel.confidence}%`],
                                            ].map(([k, v]) => (
                                                <div key={k}>
                                                    <dt className="text-xs text-muted-foreground">
                                                        {k}
                                                    </dt>
                                                    <dd>{v}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </div>
                                    <div>
                                        <p className="mb-2 text-xs uppercase text-muted-foreground">
                                            Raw original row
                                        </p>
                                        <dl className="space-y-1.5 rounded-md bg-muted p-2 font-mono text-xs">
                                            {Object.entries(sel.raw).map(([k, v]) => (
                                                <div key={k}>
                                                    <dt className="text-muted-foreground">{k}</dt>
                                                    <dd className="break-all">{v}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </div>
                                </div>
                                <div className="rounded-md border p-3 text-sm">
                                    <p className="text-xs uppercase text-muted-foreground">
                                        Lineage
                                    </p>
                                    <p className="mt-1 flex items-center gap-2">
                                        <FileSpreadsheet className="size-4 text-primary" />{" "}
                                        {sel.file} · row {sel.row}
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}

function TransactionsPage() {
    const { isLive } = useSession();
    return isLive ? <LiveTransactions /> : <SampleTransactions />;
}
