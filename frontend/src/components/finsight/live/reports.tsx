import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { csvString, downloadFile } from "@/lib/workspace";
import { useSession } from "@/components/finsight/session";
import {
    ApiGap,
    DataTable,
    ErrorLine,
    Metrics,
    Page,
    Pill,
    SourceBadge,
    cell,
} from "@/components/finsight/page-kit";
import { Logo } from "@/components/finsight/status";
import type { ReportModel } from "@/lib/report-model";
import { useLatestRun, minorText, pct, shortId } from "./common";

export function LiveReports() {
    const { user, currency } = useSession();
    const { runId } = useLatestRun();
    const run = useQuery({
        queryKey: ["run", runId],
        queryFn: () => api.run(runId as string),
        enabled: !!runId,
    });
    const [prepared, setPrepared] = useState<{
        blob: Blob;
        filename: string;
        deliver: (b: Blob, f: string) => Promise<void>;
    } | null>(null);
    const [preparing, setPreparing] = useState(false);
    const r = run.data;
    const headers = [
        "Kind",
        "Payment / record",
        "Invoices",
        "Type",
        "Confidence",
        "Applied",
        "Residual",
        "Status",
    ];
    const cells = r
        ? [
              ...r.matches.map((m) => [
                  "Match",
                  m.payment_id,
                  m.invoice_ids.join(", "),
                  m.match_type,
                  pct(m.confidence),
                  minorText(m.amount_applied_minor),
                  minorText(m.residual_minor),
                  m.status,
              ]),
              ...r.unmatched_items.map((u) => [
                  `Unmatched ${u.side}`,
                  u.record_id,
                  "—",
                  "—",
                  "—",
                  "—",
                  "—",
                  u.reason,
              ]),
          ]
        : [];

    async function preparePdf() {
        if (!r) return;
        setPreparing(true);
        try {
            const { createReportPdf, deliverReportPdf } = await import("@/lib/report-pdf");
            const model: ReportModel = {
                kind: "Reconciliation run",
                filter: `Run ${shortId(r.run_id)}`,
                currency,
                headers,
                cells,
                count: cells.length,
                net: "—",
                matched: r.matched,
                review: r.unmatched + r.exceptions,
            };
            setPrepared({
                blob: await createReportPdf(model, user?.title ?? "FinSight"),
                filename: `finsight-run-${r.run_id}.pdf`,
                deliver: deliverReportPdf,
            });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Unable to prepare the PDF.");
        } finally {
            setPreparing(false);
        }
    }
    return (
        <Page
            title="Reports"
            subtitle="Reconciliation report for the latest run"
            actions={
                <div className="flex flex-wrap gap-2">
                    <SourceBadge live />
                    <Button
                        variant="outline"
                        disabled={!r}
                        onClick={() =>
                            r &&
                            downloadFile(
                                `finsight-run-${r.run_id}.csv`,
                                csvString(
                                    cells.map((row) =>
                                        Object.fromEntries(
                                            headers.map((h, i) => [h, row[i] ?? ""]),
                                        ),
                                    ),
                                ),
                            )
                        }
                    >
                        <Download />
                        CSV
                    </Button>
                    <Button disabled={!r || preparing} onClick={() => void preparePdf()}>
                        <FileText />
                        {preparing ? "Preparing…" : "PDF"}
                    </Button>
                </div>
            }
        >
            <ErrorLine error={run.error} />
            {r ? (
                <>
                    <Metrics
                        items={[
                            { label: "Matched", value: String(r.matched) },
                            { label: "Unmatched", value: String(r.unmatched) },
                            { label: "Exceptions", value: String(r.exceptions) },
                            { label: "Run", value: shortId(r.run_id) },
                        ]}
                    />
                    <DataTable headers={headers}>
                        {cells.map((row, i) => (
                            <tr key={i}>
                                {row.map((c, j) => (
                                    <td
                                        key={j}
                                        className={`${cell} ${j === 1 ? "font-mono text-xs" : ""}`}
                                    >
                                        {j === 7 && i < r.matches.length ? (
                                            <Pill
                                                tone={
                                                    c === "accepted" || c === "auto"
                                                        ? "success"
                                                        : c === "rejected"
                                                          ? "danger"
                                                          : "warning"
                                                }
                                            >
                                                {c}
                                            </Pill>
                                        ) : (
                                            c
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </DataTable>
                </>
            ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                    Run a reconciliation to produce a report.
                </p>
            )}
            <ApiGap needs="GET /v1/transactions, GET /v1/reports (period, aging, exceptions; scheduled delivery)">
                Transaction, exceptions and source-summary reports need the transactions list
                endpoint; period and aging reports need a reporting API.
            </ApiGap>
            <Dialog
                open={Boolean(prepared)}
                onOpenChange={(o) => {
                    if (!o) setPrepared(null);
                }}
            >
                <DialogContent>
                    <Logo />
                    <DialogHeader>
                        <DialogTitle>PDF ready</DialogTitle>
                        <DialogDescription>{prepared?.filename}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            onClick={() =>
                                prepared && void prepared.deliver(prepared.blob, prepared.filename)
                            }
                        >
                            <Download />
                            Save PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Page>
    );
}
