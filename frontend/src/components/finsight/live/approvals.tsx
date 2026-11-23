import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useSession } from "@/components/finsight/session";
import { useTenantValue, type ActionRef } from "@/lib/tenant-store";
import {
    ApiGap,
    ErrorLine,
    Metrics,
    Page,
    Pill,
    SourceBadge,
    Empty,
} from "@/components/finsight/page-kit";

const LABELS: Record<string, string> = {
    send_payment_reminder: "Send payment reminder",
    mark_invoice_paid: "Mark invoice paid",
    create_reconciliation_run: "Create reconciliation run",
    flag_transaction: "Flag transaction",
};

export function LiveApprovals() {
    const { user } = useSession();
    const catalog = useQuery({ queryKey: ["actions"], queryFn: api.actionsCatalog });
    const [action, setAction] = useState("");
    const [target, setTarget] = useState("");
    const [note, setNote] = useState("");
    const [dryRun, setDryRun] = useState(true);
    const [requests, setRequests] = useTenantValue<ActionRef[]>(user?.tenantId, "actions", []);
    const entries = Object.entries(catalog.data ?? {});
    const chosen = action || entries[0]?.[0] || "";
    const execute = useMutation({
        mutationFn: () =>
            api.executeAction(chosen, { target_id: target.trim(), note: note.trim() }, dryRun),
        onSuccess: (r) => {
            setRequests((xs) =>
                [
                    {
                        id: r.action_id,
                        action: r.action,
                        status: r.status,
                        requiresApproval: r.requires_approval,
                        detail: r.detail,
                        at: new Date().toISOString(),
                        params: { target_id: target.trim(), note: note.trim(), dry_run: dryRun },
                    },
                    ...xs,
                ].slice(0, 100),
            );
            toast.success(
                r.requires_approval ? "Request submitted for approval" : "Action recorded",
            );
            setTarget("");
            setNote("");
        },
    });
    return (
        <Page
            title="Approvals"
            subtitle="Actions that change money or records need a second person (maker-checker)"
            actions={<SourceBadge live />}
        >
            <Metrics
                items={[
                    { label: "Available actions", value: String(entries.length) },
                    {
                        label: "Need approval",
                        value: String(entries.filter(([, s]) => s.requires_approval).length),
                    },
                    { label: "Your requests", value: String(requests.length) },
                    {
                        label: "Pending",
                        value: String(
                            requests.filter((r) => r.status === "pending_approval").length,
                        ),
                    },
                ]}
            />
            <section className="space-y-4 rounded-lg border bg-card p-5">
                <h2 className="text-sm font-medium">Request an action</h2>
                <ErrorLine error={catalog.error} />
                <div className="flex flex-wrap gap-2">
                    {entries.map(([name, spec]) => (
                        <Button
                            key={name}
                            size="sm"
                            variant={chosen === name ? "secondary" : "ghost"}
                            onClick={() => setAction(name)}
                        >
                            {LABELS[name] ?? name}
                            {spec.requires_approval && <Pill tone="warning">approval</Pill>}
                        </Button>
                    ))}
                </div>
                <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
                    <label className="text-xs text-muted-foreground">
                        Target (invoice, record or customer ID)
                        <Input
                            className="mt-1"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                        />
                    </label>
                    <label className="text-xs text-muted-foreground">
                        Note
                        <Input
                            className="mt-1"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <Switch checked={dryRun} onCheckedChange={setDryRun} aria-label="Dry run" />
                    Dry run (record the request without asking for execution)
                </label>
                <Button
                    disabled={!chosen || !target.trim() || execute.isPending}
                    onClick={() => execute.mutate()}
                >
                    {execute.isPending ? <Loader2 className="animate-spin" /> : <Send />}Submit
                    request
                </Button>
                <ErrorLine error={execute.error} />
            </section>
            <div className="space-y-3">
                {requests.map((r) => (
                    <article key={r.id} className="rounded-lg border bg-card p-4 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                            <div>
                                <h3 className="font-medium">{LABELS[r.action] ?? r.action}</h3>
                                <p className="font-mono text-xs text-muted-foreground">
                                    {r.id} · {String(r.params["target_id"] ?? "")}
                                </p>
                            </div>
                            <div className="text-right">
                                <Pill
                                    tone={r.status === "pending_approval" ? "warning" : "neutral"}
                                >
                                    {r.status.replace("_", " ")}
                                </Pill>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {new Date(r.at).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <p className="mt-2 text-muted-foreground">{r.detail}</p>
                    </article>
                ))}
            </div>
            {!requests.length && <Empty>No requests submitted from this browser yet.</Empty>}
            <ApiGap needs="GET /v1/actions/requests, POST /v1/actions/{id}/approve | reject">
                Requests are recorded by the action service, but it can't list them or record an
                approver's decision yet. This list is kept in this browser.
            </ApiGap>
        </Page>
    );
}
