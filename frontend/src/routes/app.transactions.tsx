import { LiveTransactions } from "@/components/finsight/live/transactions";
import { useSession } from "@/components/finsight/session";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { RowActions } from "@/components/finsight/row-actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SourceBadge } from "@/components/finsight/page-kit";
import { formatPeriod, inPeriod } from "@/lib/period";
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

export function SampleTransactions({ embedded = false }: { embedded?: boolean }) {
    const {
        records: transactions,
        setRecords,
        log,
        money,
        total,
        settings,
        period,
    } = useWorkspace();
    const [q, setQ] = useState("");
    const [status, setStatus] = useState<Status | "all">("all");
    const [sel, setSel] = useState<Txn | null>(null);
    const [editing, setEditing] = useState<Txn | null>(null);
    const [deleting, setDeleting] = useState<Txn | null>(null);

    const rows = useMemo(
        () =>
            transactions.filter(
                (t) =>
                    inPeriod(t.date, period) &&
                    (status === "all" || t.status === status) &&
                    (q === "" ||
                        `${t.counterparty} ${t.reference} ${t.source}`
                            .toLowerCase()
                            .includes(q.toLowerCase())),
            ),
        [q, status, transactions, period],
    );
    const totals = totalsByCurrency(rows);

    return (
        <div className="mx-auto max-w-7xl space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    {embedded ? (
                        <h2 className="flex items-center gap-2 text-lg font-semibold">
                            Example records <SourceBadge live={false} />
                        </h2>
                    ) : (
                        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
                    )}
                    <p className="text-sm text-muted-foreground">
                        {rows.length} records · {formatPeriod(period)}
                        {embedded ? " · sample data to explore; your files live on Sources" : ""}
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
                                "",
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
                                className="group cursor-pointer transition-colors hover:bg-muted/50"
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
                                <td className="px-2 py-1 text-right">
                                    <RowActions
                                        onView={() => setSel(t)}
                                        onEdit={() => setEditing(t)}
                                        onDelete={() => setDeleting(t)}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                        No records match. Try a wider date range, clear the filters, or upload a new
                        source.
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
            <EditRecordDialog
                record={editing}
                onClose={() => setEditing(null)}
                onSave={(next) => {
                    setRecords((xs) => xs.map((x) => (x.id === next.id ? next : x)));
                    log("Record edited", next.id, `${next.counterparty} · ${next.reference}`);
                    toast.success("Record updated");
                    setEditing(null);
                }}
            />
            <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleting
                                ? `${deleting.counterparty} · ${deleting.reference} will be removed from this workspace.`
                                : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-danger text-white hover:bg-danger/90"
                            onClick={() => {
                                if (!deleting) return;
                                const removed = deleting;
                                setRecords((xs) => xs.filter((x) => x.id !== removed.id));
                                log("Record deleted", removed.id, removed.counterparty);
                                setDeleting(null);
                                toast("Record deleted", {
                                    action: {
                                        label: "Undo",
                                        onClick: () => setRecords((xs) => [removed, ...xs]),
                                    },
                                });
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function EditRecordDialog({
    record,
    onClose,
    onSave,
}: {
    record: Txn | null;
    onClose: () => void;
    onSave: (next: Txn) => void;
}) {
    const [draft, setDraft] = useState<Txn | null>(record);
    const [prevId, setPrevId] = useState<string | null>(null);
    if ((record?.id ?? null) !== prevId) {
        setPrevId(record?.id ?? null);
        setDraft(record);
    }
    const amountOk = draft ? Number.isFinite(draft.amount) && draft.amount !== 0 : false;
    const valid = !!draft && draft.counterparty.trim() !== "" && amountOk;
    return (
        <Dialog open={!!record} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit record</DialogTitle>
                    <DialogDescription>{record?.id}</DialogDescription>
                </DialogHeader>
                {draft && (
                    <form
                        id="edit-record"
                        className="grid gap-3 sm:grid-cols-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (valid)
                                onSave({ ...draft, counterparty: draft.counterparty.trim() });
                        }}
                    >
                        <label className="text-sm sm:col-span-2">
                            Counterparty
                            <Input
                                className="mt-1"
                                value={draft.counterparty}
                                maxLength={80}
                                onChange={(e) =>
                                    setDraft({ ...draft, counterparty: e.target.value })
                                }
                            />
                        </label>
                        <label className="text-sm">
                            Reference
                            <Input
                                className="mt-1"
                                value={draft.reference}
                                maxLength={40}
                                onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
                            />
                        </label>
                        <label className="text-sm">
                            Date
                            <Input
                                className="mt-1"
                                type="date"
                                value={draft.date}
                                onChange={(e) =>
                                    e.target.value && setDraft({ ...draft, date: e.target.value })
                                }
                            />
                        </label>
                        <label className="text-sm">
                            Amount ({draft.currency})
                            <Input
                                className="mt-1"
                                type="number"
                                step="0.01"
                                value={Number.isFinite(draft.amount) ? draft.amount : ""}
                                onChange={(e) =>
                                    setDraft({ ...draft, amount: e.target.valueAsNumber })
                                }
                            />
                        </label>
                        <label className="text-sm">
                            Status
                            <Select
                                value={draft.status}
                                onValueChange={(v) => setDraft({ ...draft, status: v as Status })}
                            >
                                <SelectTrigger className="mt-1 w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="matched">Matched</SelectItem>
                                    <SelectItem value="review">Needs review</SelectItem>
                                    <SelectItem value="exception">Exception</SelectItem>
                                </SelectContent>
                            </Select>
                        </label>
                    </form>
                )}
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" form="edit-record" disabled={!valid}>
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function TransactionsPage() {
    const { isLive } = useSession();
    return isLive ? (
        <div className="space-y-10">
            <LiveTransactions />
            <div className="mx-auto max-w-7xl border-t pt-8">
                <SampleTransactions embedded />
            </div>
        </div>
    ) : (
        <SampleTransactions />
    );
}
