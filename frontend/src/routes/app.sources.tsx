import { LiveSources } from "@/components/finsight/live/sources";
import { useSession } from "@/components/finsight/session";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Upload, Download, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { Page, Metrics, DataTable, Pill, pageHead, cell } from "@/components/finsight/page-kit";
import { csvString, downloadFile, parseTransactions } from "@/lib/workspace";
import { toast } from "sonner";
export const Route = createFileRoute("/app/sources")({
    head: () =>
        pageHead(
            "Sources & uploads",
            "Import CSV financial records and inspect source history in the FinSight sandbox.",
        ),
    component: SourcesPage,
});
function SampleSources() {
    const { uploads, setUploads, setRecords, log } = useWorkspace();
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [drag, setDrag] = useState(false);
    async function upload(file?: File) {
        if (!file) return;
        setError("");
        if (!file.name.toLowerCase().endsWith(".csv")) {
            setError("Only CSV imports are available in this sandbox.");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError("Choose a CSV smaller than 5 MB.");
            return;
        }
        setBusy(true);
        try {
            const rows = parseTransactions(await file.text(), file.name);
            setRecords((xs) => [...rows, ...xs]);
            setUploads((xs) => [
                {
                    id: crypto.randomUUID(),
                    name: file.name,
                    source: "CSV upload",
                    rows: rows.length,
                    date: new Date().toISOString().slice(0, 16).replace("T", " "),
                    status: "Imported",
                },
                ...xs,
            ]);
            log("Import completed", file.name, `${rows.length} records added for review.`);
            toast.success(`${rows.length} transactions imported`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not read this file.");
        } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
        }
    }
    return (
        <Page
            title="Sources & uploads"
            subtitle="Sandbox imports · CSV · up to 5 MB"
            actions={
                <Button
                    variant="outline"
                    onClick={() =>
                        downloadFile(
                            "finsight-template.csv",
                            csvString([
                                {
                                    date: "2026-10-27",
                                    counterparty: "Example customer",
                                    amount: 850000,
                                    currency: "RWF",
                                    reference: "INV-2500",
                                    source: "Bank",
                                },
                            ]),
                        )
                    }
                >
                    <Download />
                    CSV template
                </Button>
            }
        >
            <Metrics
                items={[
                    { label: "Sources", value: String(new Set(uploads.map((u) => u.source)).size) },
                    { label: "Files imported", value: String(uploads.length) },
                    {
                        label: "Imported records",
                        value: String(uploads.reduce((n, u) => n + u.rows, 0)),
                    },
                    {
                        label: "Environment",
                        value: "Sandbox",
                        detail: "Changes reset when refreshed",
                    },
                ]}
            />
            <section
                onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    void upload(e.dataTransfer.files[0]);
                }}
                className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed py-10 ${drag ? "border-primary bg-accent" : "border-border"}`}
            >
                <Upload className="size-7 text-primary" />
                <h2 className="font-medium">Import transactions</h2>
                <p className="text-sm text-muted-foreground">
                    CSV files · date, counterparty, amount, currency
                </p>
                <Button disabled={busy} onClick={() => input.current?.click()}>
                    <Upload />
                    {busy ? "Importing…" : "Choose CSV"}
                </Button>
                <input
                    ref={input}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => void upload(e.target.files?.[0])}
                />
            </section>
            {error && (
                <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
                    {error}
                </p>
            )}
            <DataTable headers={["File", "Source", "Records", "Imported (UTC)", "Status"]}>
                {uploads.map((u) => (
                    <tr key={u.id}>
                        <td className={cell}>
                            <span className="flex items-center gap-2">
                                <FileSpreadsheet className="size-4 text-primary" />
                                {u.name}
                            </span>
                        </td>
                        <td className={cell}>{u.source}</td>
                        <td className={`${cell} num`}>{u.rows}</td>
                        <td className={`${cell} text-muted-foreground`}>{u.date}</td>
                        <td className={cell}>
                            <Pill tone="success">
                                <CheckCircle2 className="mr-1 size-3" />
                                {u.status}
                            </Pill>
                        </td>
                    </tr>
                ))}
            </DataTable>
        </Page>
    );
}

function SourcesPage() {
    const { isLive } = useSession();
    return isLive ? <LiveSources /> : <SampleSources />;
}
