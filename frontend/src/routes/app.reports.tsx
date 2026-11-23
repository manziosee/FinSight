import { LiveReports } from "@/components/finsight/live/reports";
import { useSession } from "@/components/finsight/session";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/components/finsight/workspace-context";
import {
    Page,
    Metrics,
    DataTable,
    Empty,
    Pill,
    pageHead,
    cell,
} from "@/components/finsight/page-kit";
import { totalsByCurrency, type Currency } from "@/lib/money";
import { displayProjection } from "@/lib/currency-display";
import { csvString, downloadFile } from "@/lib/workspace";
import { buildReportModel, type ReportKind } from "@/lib/report-model";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Logo } from "@/components/finsight/status";
import { toast } from "sonner";
export const Route = createFileRoute("/app/reports")({
    head: () =>
        pageHead(
            "Reports",
            "Export sample transaction, reconciliation and source reports by currency.",
        ),
    component: ReportsPage,
});
function SampleReports() {
    const { records, log, money, settings, total } = useWorkspace();
    const [kind, setKind] = useState<ReportKind>("Transactions"),
        [currency, setCurrency] = useState("All");
    const [preparing, setPreparing] = useState(false);
    const [prepared, setPrepared] = useState<{
        blob: Blob;
        filename: string;
        kind: ReportKind;
        count: number;
        currency: Currency;
        deliver: (blob: Blob, filename: string) => Promise<void>;
    } | null>(null);
    async function preparePdf() {
        setPreparing(true);
        try {
            const { createReportPdf, deliverReportPdf } = await import("@/lib/report-pdf");
            const report = buildReportModel(records, kind, currency, settings.currency);
            const blob = await createReportPdf(report, settings.organization);
            setPrepared({
                blob,
                filename: `finsight-${kind.toLowerCase().replaceAll(" ", "-")}.pdf`,
                kind,
                count: report.count,
                currency: settings.currency,
                deliver: deliverReportPdf,
            });
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Unable to prepare the PDF. Please try again.",
            );
        } finally {
            setPreparing(false);
        }
    }
    async function downloadPdf() {
        if (!prepared) return;
        try {
            await prepared.deliver(prepared.blob, prepared.filename);
            log(
                "Report exported",
                prepared.kind,
                `${prepared.count} sample records · PDF · ${prepared.currency} display currency.`,
            );
        } catch {
            toast.error("Unable to download the PDF. Please try again.");
        }
    }
    const rows = records.filter(
        (r) =>
            (currency === "All" || r.currency === currency) &&
            (kind !== "Exceptions" || r.status !== "matched"),
    );
    const totals = totalsByCurrency(rows);
    const grouped = [...new Set(rows.map((r) => r.sourceType))].flatMap((source) =>
        Object.entries(totalsByCurrency(rows.filter((r) => r.sourceType === source))).map(
            ([c, v]) => ({
                source,
                currency: c as Currency,
                amount: v,
                records: rows.filter((r) => r.sourceType === source && r.currency === c).length,
            }),
        ),
    );
    function exportReport() {
        const data =
            kind === "Source summary"
                ? grouped.map((g) => ({
                      source: g.source,
                      currency: g.currency,
                      net_amount: g.amount,
                      records: g.records,
                      ...displayProjection(g.amount, g.currency, settings.currency),
                  }))
                : rows.map((r) => ({
                      date: r.date,
                      source: r.source,
                      counterparty: r.counterparty,
                      reference: r.reference,
                      amount: r.amount,
                      currency: r.currency,
                      status: r.status,
                      file: r.file,
                      row: r.row,
                      ...displayProjection(r.amount, r.currency, settings.currency),
                  }));
        downloadFile(`finsight-${kind.toLowerCase().replaceAll(" ", "-")}.csv`, csvString(data));
        log(
            "Report exported",
            kind,
            `${rows.length} sample records · ${currency} currencies filter.`,
        );
    }
    return (
        <Page
            title="Reports"
            subtitle={`Display: ${settings.currency} · exports include original and converted amounts`}
            actions={
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={!rows.length} onClick={exportReport}>
                        <Download />
                        Download CSV
                    </Button>
                    <Button disabled={!rows.length || preparing} onClick={() => void preparePdf()}>
                        <FileText />
                        {preparing ? "Preparing PDF…" : "Download PDF"}
                    </Button>
                </div>
            }
        >
            <div className="flex flex-wrap gap-3">
                <Select
                    value={kind}
                    onValueChange={(value) => {
                        if (
                            value === "Transactions" ||
                            value === "Exceptions" ||
                            value === "Source summary"
                        )
                            setKind(value);
                    }}
                >
                    <SelectTrigger aria-label="Report type" className="w-52">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {["Transactions", "Exceptions", "Source summary"].map((k) => (
                            <SelectItem key={k} value={k}>
                                {k}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger aria-label="Source currency filter" className="w-40">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {["All", "RWF", "USD", "EUR", "KES", "UGX"].map((c) => (
                            <SelectItem key={c} value={c}>
                                {c === "All" ? "All source currencies" : c}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <Metrics
                items={[
                    { label: "Records", value: String(rows.length) },
                    {
                        label: "Matched",
                        value: String(rows.filter((r) => r.status === "matched").length),
                    },
                    {
                        label: "Needs review",
                        value: String(rows.filter((r) => r.status === "review").length),
                    },
                    {
                        label: "Exceptions",
                        value: String(rows.filter((r) => r.status === "exception").length),
                    },
                ]}
            />
            <section>
                <h2 className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="size-4 text-primary" />
                    {kind}
                </h2>
                <div className="mt-3 flex flex-wrap gap-6">
                    <p className="num text-sm">Net {money(total(rows), settings.currency)}</p>
                </div>
            </section>
            {kind === "Source summary" ? (
                <DataTable headers={["Source", "Original currency", "Records", "Converted net"]}>
                    {grouped.map((g) => (
                        <tr key={`${g.source}-${g.currency}`}>
                            <td className={cell}>{g.source}</td>
                            <td className={cell}>{g.currency}</td>
                            <td className={`${cell} num`}>{g.records}</td>
                            <td className={`${cell} num`}>{money(g.amount, g.currency)}</td>
                        </tr>
                    ))}
                </DataTable>
            ) : (
                <DataTable headers={["Date", "Counterparty", "Reference", "Amount", "Status"]}>
                    {rows.map((r) => (
                        <tr key={r.id}>
                            <td className={`${cell} num`}>{r.date}</td>
                            <td className={cell}>{r.counterparty}</td>
                            <td className={cell}>{r.reference}</td>
                            <td className={`${cell} num`}>{money(r.amount, r.currency)}</td>
                            <td className={cell}>
                                <Pill
                                    tone={
                                        r.status === "matched"
                                            ? "success"
                                            : r.status === "review"
                                              ? "warning"
                                              : "danger"
                                    }
                                >
                                    {r.status}
                                </Pill>
                            </td>
                        </tr>
                    ))}
                </DataTable>
            )}
            {!rows.length && <Empty>No records for this selection.</Empty>}
            <Dialog
                open={Boolean(prepared)}
                onOpenChange={(open) => {
                    if (!open) setPrepared(null);
                }}
            >
                <DialogContent>
                    <Logo />
                    <DialogHeader>
                        <DialogTitle>PDF ready</DialogTitle>
                        <DialogDescription>
                            {prepared?.kind} · {prepared?.count} records · {prepared?.currency}
                        </DialogDescription>
                    </DialogHeader>
                    <p className="break-all text-sm text-muted-foreground">{prepared?.filename}</p>
                    <DialogFooter>
                        <Button onClick={() => void downloadPdf()}>
                            <Download />
                            Save PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Page>
    );
}

function ReportsPage() {
    const { isLive } = useSession();
    return isLive ? <LiveReports /> : <SampleReports />;
}
