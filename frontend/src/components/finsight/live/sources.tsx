import { useRef, useState } from "react";
import { useMutation, useQueries, useQueryClient, type Query } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, XCircle, GitMerge } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { api, ApiError, UPLOAD_ACCEPT, uploadContentType, type IngestionStatus } from "@/lib/api";
import { useSession } from "@/components/finsight/session";
import { useTenantValue, type UploadRef } from "@/lib/tenant-store";
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

// RecordSource values from the Universal Financial Schema.
const SOURCES = [
    ["bank", "Bank statement"],
    ["mobile_money", "Mobile money"],
    ["erp", "ERP / invoices"],
    ["accounting", "Accounting export"],
    ["payment_gateway", "Payment gateway"],
    ["card", "Card processor"],
    ["pos", "Point of sale"],
    ["spreadsheet", "Spreadsheet"],
    ["pdf", "PDF statement"],
    ["other", "Other"],
] as const;
const MAX_BYTES = 50 * 1024 * 1024;

export function LiveSources() {
    const { user } = useSession();
    const queryClient = useQueryClient();
    const input = useRef<HTMLInputElement>(null);
    const [source, setSource] = useState<string>("bank");
    const [drag, setDrag] = useState(false);
    const [error, setError] = useState("");
    const [uploads, setUploads] = useTenantValue<UploadRef[]>(user?.tenantId, "uploads", []);

    const statuses = useQueries({
        queries: uploads.map((u) => ({
            queryKey: ["ingestion", u.id],
            queryFn: () => api.ingestion(u.id),
            // poll until normalization reports back
            refetchInterval: (
                q: Query<IngestionStatus, Error, IngestionStatus, readonly unknown[]>,
            ) => (q.state.data && q.state.data.status !== "received" ? false : 2000),
        })),
    });

    const upload = useMutation({
        mutationFn: async (file: File) => ({ file, accepted: await api.upload(file, source) }),
        onSuccess: ({ file, accepted }) => {
            setUploads((xs) =>
                [
                    {
                        id: accepted.ingestion_id,
                        name: file.name,
                        source,
                        at: new Date().toISOString(),
                    },
                    ...xs,
                ].slice(0, 50),
            );
            toast.success(`${file.name} accepted — normalizing`);
            void queryClient.invalidateQueries({ queryKey: ["summary"] });
        },
        onError: (e) => setError(e instanceof ApiError ? (e.detail ?? e.title) : "Upload failed"),
    });

    function pick(file?: File) {
        setError("");
        if (!file) return;
        if (!uploadContentType(file))
            return setError("Upload CSV, JSON, Excel (.xlsx/.xls), PDF or text files.");
        if (file.size > MAX_BYTES) return setError("Files are limited to 50 MB.");
        upload.mutate(file);
        if (input.current) input.current.value = "";
    }

    const done = statuses.filter((s) => s.data?.status === "completed").length;
    const records = statuses.reduce((n, s) => n + (s.data?.record_count ?? 0), 0);

    return (
        <Page
            title="Sources & uploads"
            subtitle="CSV · JSON · Excel · PDF · up to 50 MB"
            actions={<SourceBadge live />}
        >
            <Metrics
                items={[
                    { label: "Uploads (this browser)", value: String(uploads.length) },
                    { label: "Normalized", value: String(done) },
                    { label: "Records extracted", value: String(records) },
                    { label: "Tenant", value: user?.tenantId ?? "—" },
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
                    pick(e.dataTransfer.files[0]);
                }}
                className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed py-10 ${drag ? "border-primary bg-accent" : "border-border"}`}
            >
                <Upload className="size-7 text-primary" />
                <h2 className="font-medium">Upload financial data</h2>
                <p className="text-sm text-muted-foreground">
                    Bank statements, mobile-money exports, invoices, ERP or accounting exports
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={source} onValueChange={setSource}>
                        <SelectTrigger aria-label="Source type" className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {SOURCES.map(([v, l]) => (
                                <SelectItem key={v} value={v}>
                                    {l}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button disabled={upload.isPending} onClick={() => input.current?.click()}>
                        {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                        {upload.isPending ? "Uploading…" : "Choose file"}
                    </Button>
                </div>
                <input
                    ref={input}
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    className="hidden"
                    onChange={(e) => pick(e.target.files?.[0])}
                />
            </section>
            <ErrorLine error={error || null} />

            <DataTable headers={["File", "Source", "Status", "Records", "Warnings", "Uploaded"]}>
                {uploads.map((u, i) => {
                    const s = statuses[i]?.data;
                    return (
                        <tr key={u.id}>
                            <td className={cell}>
                                <span className="flex items-center gap-2">
                                    <FileSpreadsheet className="size-4 text-primary" />
                                    {u.name}
                                </span>
                                <span className="block font-mono text-[10px] text-muted-foreground">
                                    {u.id}
                                </span>
                            </td>
                            <td className={cell}>
                                {SOURCES.find(([v]) => v === u.source)?.[1] ?? u.source}
                            </td>
                            <td className={cell}>
                                {!s ? (
                                    <Pill>
                                        <Loader2 className="mr-1 size-3 animate-spin" />
                                        checking
                                    </Pill>
                                ) : s.status === "completed" ? (
                                    <Pill tone="success">
                                        <CheckCircle2 className="mr-1 size-3" />
                                        Completed
                                    </Pill>
                                ) : s.status === "failed" ? (
                                    <Pill tone="danger">
                                        <XCircle className="mr-1 size-3" />
                                        Failed
                                    </Pill>
                                ) : (
                                    <Pill tone="warning">
                                        <Loader2 className="mr-1 size-3 animate-spin" />
                                        Normalizing
                                    </Pill>
                                )}
                                {s?.error_summary && (
                                    <span className="mt-1 block text-xs text-danger">
                                        {s.error_summary}
                                    </span>
                                )}
                            </td>
                            <td className={`${cell} num`}>{s?.record_count ?? "—"}</td>
                            <td className={`${cell} text-xs text-muted-foreground`}>
                                {s?.warnings.length ? s.warnings.join("; ") : "—"}
                            </td>
                            <td className={`${cell} text-muted-foreground`}>
                                {new Date(u.at).toLocaleString()}
                            </td>
                        </tr>
                    );
                })}
            </DataTable>
            {uploads.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">
                    No uploads from this browser yet.
                </p>
            )}
            {done > 0 && (
                <Button asChild variant="outline" className="w-fit">
                    <Link to="/app/reconciliation">
                        <GitMerge />
                        Reconcile uploaded data
                    </Link>
                </Button>
            )}
            <ApiGap needs="GET /v1/data/ingestions (list), column-mapping preview, saved source templates">
                The upload history above is remembered in this browser only; the API can look up an
                ingestion by ID but can't list them yet.
            </ApiGap>
        </Page>
    );
}
