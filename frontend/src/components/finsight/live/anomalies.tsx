import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Upload, ScanSearch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type AnomalyTxn } from "@/lib/api";
import { toApiMinor } from "@/lib/money";
import { parseTransactions } from "@/lib/workspace";
import {
    ApiGap,
    ErrorLine,
    Metrics,
    Page,
    Pill,
    SourceBadge,
    Empty,
} from "@/components/finsight/page-kit";
import { useLatestRun } from "./common";

export function LiveAnomalies() {
    const { summary } = useLatestRun();
    const input = useRef<HTMLInputElement>(null);
    const [z, setZ] = useState(3);
    const [scanned, setScanned] = useState<{ label: string; count: number } | null>(null);
    const [fileError, setFileError] = useState("");
    const detect = useMutation({
        mutationFn: (v: { rows: AnomalyTxn[]; label: string }) => api.detect(v.rows, z),
        onSuccess: (_d, v) => setScanned({ label: v.label, count: v.rows.length }),
    });

    const openInvoices = summary.data?.has_data ? summary.data.open_invoices : [];
    function scanInvoices() {
        detect.mutate({
            label: "open invoices",
            rows: openInvoices.map((i) => ({
                id: i.id,
                amount_minor: i.open_minor,
                currency: i.currency,
                counterparty: i.counterparty,
            })),
        });
    }
    async function scanFile(file?: File) {
        setFileError("");
        if (!file) return;
        try {
            const rows = parseTransactions(await file.text(), file.name);
            detect.mutate({
                label: file.name,
                rows: rows.map((r) => ({
                    id: `${file.name}#${r.row}`,
                    amount_minor: toApiMinor(r.amount),
                    currency: r.currency,
                    counterparty: r.counterparty,
                    reference: r.reference,
                })),
            });
        } catch (e) {
            setFileError(e instanceof Error ? e.message : "Could not read this CSV.");
        } finally {
            if (input.current) input.current.value = "";
        }
    }
    const findings = detect.data ?? [];
    return (
        <Page
            title="Anomalies"
            subtitle="Duplicate payments and unusual amounts"
            actions={<SourceBadge live />}
        >
            <Metrics
                items={[
                    { label: "Records scanned", value: String(scanned?.count ?? 0) },
                    { label: "Findings", value: String(findings.length) },
                    {
                        label: "High severity",
                        value: String(findings.filter((f) => f.severity === "high").length),
                    },
                    { label: "Z-score threshold", value: String(z) },
                ]}
            />
            <div className="flex flex-wrap items-center gap-2">
                <Button disabled={!openInvoices.length || detect.isPending} onClick={scanInvoices}>
                    {detect.isPending ? <Loader2 className="animate-spin" /> : <ScanSearch />}Scan
                    open invoices ({openInvoices.length})
                </Button>
                <Button
                    variant="outline"
                    disabled={detect.isPending}
                    onClick={() => input.current?.click()}
                >
                    <Upload />
                    Scan a CSV
                </Button>
                <input
                    ref={input}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => void scanFile(e.target.files?.[0])}
                />
                <label className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
                    Sensitivity
                    <select
                        className="rounded-md border bg-background px-2 py-1"
                        value={z}
                        onChange={(e) => setZ(Number(e.target.value))}
                    >
                        {[2, 2.5, 3, 4].map((v) => (
                            <option key={v} value={v}>
                                z ≥ {v}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <ErrorLine error={detect.error ?? (fileError || null)} />
            {scanned && (
                <p className="text-sm text-muted-foreground">
                    Scanned {scanned.count} records from {scanned.label}.
                </p>
            )}
            <div className="space-y-3">
                {findings.map((f, i) => (
                    <article
                        key={`${f.record_id}-${f.rule}-${i}`}
                        className="rounded-lg border bg-card p-5"
                    >
                        <div className="flex flex-wrap items-start gap-3">
                            <AlertTriangle
                                className={`mt-1 size-5 ${f.severity === "high" ? "text-danger" : "text-warning"}`}
                            />
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="font-medium">
                                        {f.rule === "duplicate_payment"
                                            ? "Possible duplicate payment"
                                            : f.rule === "amount_zscore"
                                              ? "Unusual amount"
                                              : f.rule}
                                    </h2>
                                    <Pill tone={f.severity === "high" ? "danger" : "warning"}>
                                        {f.severity}
                                    </Pill>
                                    <Pill>score {f.score}</Pill>
                                </div>
                                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                                    {f.record_id}
                                </p>
                            </div>
                        </div>
                        <p className="mt-3 text-sm">{f.explanation}</p>
                    </article>
                ))}
            </div>
            {scanned && !findings.length && <Empty>No anomalies found in these records.</Empty>}
            <ApiGap needs="anomalies on ingest (event-driven), GET /v1/anomalies, PATCH status (investigating / resolved / dismissed)">
                Detection runs on demand over the records you choose. Findings aren't stored yet, so
                they can't be assigned, resolved or dismissed.
            </ApiGap>
        </Page>
    );
}
