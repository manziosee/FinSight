import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { ApiGap, ErrorLine, Page, Pill, SourceBadge } from "@/components/finsight/page-kit";
import { minorText, pct } from "./common";

export function LiveTransactions() {
    const [form, setForm] = useState({
        amount: "850000",
        currency: "RWF",
        description: "ABC LTD PMT INV 439",
        date: new Date().toISOString().slice(0, 10),
        counterparty: "",
    });
    const understand = useMutation({
        mutationFn: () =>
            api.understand({
                amount: Number(form.amount.replaceAll(",", "")),
                currency: form.currency,
                description: form.description,
                date: form.date,
                ...(form.counterparty ? { counterparty: form.counterparty } : {}),
            }),
    });
    const r = understand.data;
    const field = (key: keyof typeof form, label: string, type = "text") => (
        <label className="block text-xs text-muted-foreground">
            {label}
            <Input
                className="mt-1"
                type={type}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
        </label>
    );
    return (
        <Page
            title="Transactions"
            subtitle="Normalized financial records"
            actions={<SourceBadge live />}
        >
            <ApiGap needs="GET /v1/transactions (search, filters, pagination)">
                Browsing every normalized record needs a transactions list endpoint. Until then,
                upload files on Sources and work matches on Reconciliation — or normalize a single
                record below.
            </ApiGap>
            <section className="grid gap-6 rounded-lg border bg-card p-5 lg:grid-cols-[320px_1fr]">
                <form
                    className="space-y-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        understand.mutate();
                    }}
                >
                    <h2 className="flex items-center gap-2 text-sm font-medium">
                        <Wand2 className="size-4 text-primary" />
                        Understand a transaction
                    </h2>
                    {field("description", "Description / narration")}
                    <div className="grid grid-cols-2 gap-2">
                        {field("amount", "Amount")}
                        {field("currency", "Currency")}
                    </div>
                    {field("date", "Date", "date")}
                    {field("counterparty", "Counterparty (optional)")}
                    <Button type="submit" disabled={understand.isPending}>
                        {understand.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
                        Normalize
                    </Button>
                </form>
                <div className="min-w-0">
                    <ErrorLine error={understand.error} />
                    {r ? (
                        <dl className="grid grid-cols-2 gap-3 text-sm">
                            {[
                                ["Classification", r.classification],
                                ["Confidence", pct(r.confidence)],
                                [
                                    "Amount",
                                    minorText(
                                        r.record.amount.minor_units,
                                        r.record.amount.currency,
                                    ),
                                ],
                                ["Direction", r.record.direction],
                                ["Reference", r.record.reference ?? "—"],
                                [
                                    "Counterparty",
                                    r.record.counterparty?.normalized_name ??
                                        r.record.counterparty?.name ??
                                        "—",
                                ],
                                ["Occurred", new Date(r.record.occurred_at).toLocaleDateString()],
                                ["Record ID", r.record.id],
                            ].map(([k, v]) => (
                                <div key={k}>
                                    <dt className="text-xs text-muted-foreground">{k}</dt>
                                    <dd className="break-all">{v}</dd>
                                </div>
                            ))}
                            {r.warnings.length > 0 && (
                                <div className="col-span-2 flex flex-wrap gap-2">
                                    {r.warnings.map((w) => (
                                        <Pill key={w} tone="warning">
                                            {w}
                                        </Pill>
                                    ))}
                                </div>
                            )}
                        </dl>
                    ) : (
                        <p className="py-10 text-center text-sm text-muted-foreground">
                            The normalized record appears here: type, direction, amount, resolved
                            counterparty and confidence.
                        </p>
                    )}
                </div>
            </section>
        </Page>
    );
}
