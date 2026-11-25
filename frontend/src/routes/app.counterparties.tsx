import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { LiveCounterparties } from "@/components/finsight/live/counterparties";
import { useSession } from "@/components/finsight/session";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/finsight/workspace-context";
import {
    Page,
    Metrics,
    DataTable,
    Pill,
    Empty,
    pageHead,
    cell,
    SourceBadge,
} from "@/components/finsight/page-kit";
import { totalsByCurrency, type Currency } from "@/lib/money";
import { displayProjection } from "@/lib/currency-display";
import { csvString, downloadFile } from "@/lib/workspace";
export const Route = createFileRoute("/app/counterparties")({
    head: () =>
        pageHead(
            "Counterparties",
            "Inspect counterparties, source records and currency-separated activity.",
        ),
    component: CounterpartiesPage,
});
function SampleCounterparties({ embedded = false }: { embedded?: boolean }) {
    const { records, money, settings } = useWorkspace();
    const [q, setQ] = useState("");
    const [selected, setSelected] = useState<string | null>(null);
    const parties = useMemo(
        () =>
            [...new Set(records.map((r) => r.counterparty))]
                .map((name) => {
                    const rows = records.filter((r) => r.counterparty === name);
                    return {
                        name,
                        rows,
                        totals: totalsByCurrency(rows),
                        review: rows.filter((r) => r.status !== "matched").length,
                    };
                })
                .filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
        [records, q],
    );
    return (
        <Page
            level={embedded ? 2 : 1}
            title={
                embedded ? (
                    <>
                        Example directory <SourceBadge live={false} />
                    </>
                ) : (
                    "Counterparties"
                )
            }
            subtitle="Customer & vendor activity · sample records"
            actions={
                <Button
                    variant="outline"
                    onClick={() =>
                        downloadFile(
                            "counterparties.csv",
                            csvString(
                                parties.flatMap((p) =>
                                    Object.entries(p.totals).map(([currency, amount]) => ({
                                        name: p.name,
                                        currency,
                                        net_amount: amount,
                                        records: p.rows.length,
                                        needs_review: p.review,
                                        ...displayProjection(
                                            amount ?? 0,
                                            currency as Currency,
                                            settings.currency,
                                        ),
                                    })),
                                ),
                            ),
                        )
                    }
                >
                    <Download />
                    Export
                </Button>
            }
        >
            <Metrics
                items={[
                    { label: "Counterparties", value: String(parties.length) },
                    {
                        label: "Sources",
                        value: String(new Set(records.map((r) => r.sourceType)).size),
                    },
                    { label: "Records", value: String(records.length) },
                    {
                        label: "Need review",
                        value: String(records.filter((r) => r.status !== "matched").length),
                    },
                ]}
            />
            <Input
                aria-label="Search counterparties"
                placeholder="Search counterparties…"
                className="max-w-sm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
            />
            <DataTable headers={["Counterparty", "Sources", "Records", "Net activity", "Review"]}>
                {parties.map((p) => (
                    <tr key={p.name}>
                        <td className={cell}>
                            <Button
                                variant="link"
                                className="h-auto p-0 text-foreground"
                                onClick={() => setSelected(p.name)}
                            >
                                <Users />
                                {p.name}
                            </Button>
                        </td>
                        <td className={`${cell} text-muted-foreground`}>
                            {[...new Set(p.rows.map((r) => r.sourceType))].join(", ")}
                        </td>
                        <td className={`${cell} num`}>{p.rows.length}</td>
                        <td className={`${cell} num`}>
                            {Object.entries(p.totals).map(([c, v]) => (
                                <div key={c}>{money(v, c as Currency)}</div>
                            ))}
                        </td>
                        <td className={cell}>
                            <Pill tone={p.review ? "warning" : "success"}>
                                {p.review ? `${p.review} to review` : "Clear"}
                            </Pill>
                        </td>
                    </tr>
                ))}
            </DataTable>
            {!parties.length && <Empty>No counterparties match this search.</Empty>}
            <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{selected}</DialogTitle>
                        <DialogDescription>Linked transaction records</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        {records
                            .filter((r) => r.counterparty === selected)
                            .map((r) => (
                                <div key={r.id} className="border-b py-3 text-sm">
                                    <div className="flex justify-between gap-3">
                                        <span>{r.reference}</span>
                                        <strong className="num">
                                            {money(r.amount, r.currency)}
                                        </strong>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {r.date} · {r.source}
                                    </p>
                                    <p className="mt-1 text-xs text-primary">
                                        {r.file} · row {r.row}
                                    </p>
                                </div>
                            ))}
                    </div>
                </DialogContent>
            </Dialog>
        </Page>
    );
}

function CounterpartiesPage() {
    const { isLive } = useSession();
    return isLive ? (
        <div className="space-y-10">
            <LiveCounterparties />
            <div className="mx-auto max-w-7xl border-t pt-8">
                <SampleCounterparties embedded />
            </div>
        </div>
    ) : (
        <SampleCounterparties />
    );
}
