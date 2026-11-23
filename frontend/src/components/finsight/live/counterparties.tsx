import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search, Route as RouteIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import {
    ApiGap,
    DataTable,
    ErrorLine,
    Page,
    SourceBadge,
    cell,
} from "@/components/finsight/page-kit";

export function LiveCounterparties() {
    const [entityId, setEntityId] = useState("");
    const [depth, setDepth] = useState(2);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const entity = useMutation({ mutationFn: () => api.entity(entityId.trim(), depth) });
    const paths = useMutation({ mutationFn: () => api.paths(from.trim(), to.trim()) });
    return (
        <Page
            title="Counterparties"
            subtitle="The financial graph: customers, invoices, payments and bank lines"
            actions={<SourceBadge live />}
        >
            <ApiGap needs="GET /v1/counterparties (directory, balances, merge/split)">
                A counterparty directory needs a list endpoint. You can explore any entity in the
                graph by ID — record IDs appear on Reconciliation; customers are{" "}
                <code>cust_&lt;name&gt;</code>.
            </ApiGap>
            <section className="space-y-3 rounded-lg border bg-card p-5">
                <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (entityId.trim()) entity.mutate();
                    }}
                >
                    <Input
                        aria-label="Entity ID"
                        className="max-w-sm"
                        placeholder="Entity ID, e.g. cust_abc_ltd"
                        value={entityId}
                        onChange={(e) => setEntityId(e.target.value)}
                    />
                    <select
                        aria-label="Depth"
                        className="rounded-md border bg-background px-2 text-sm"
                        value={depth}
                        onChange={(e) => setDepth(Number(e.target.value))}
                    >
                        {[1, 2, 3, 4].map((d) => (
                            <option key={d} value={d}>
                                {d} hop{d > 1 ? "s" : ""}
                            </option>
                        ))}
                    </select>
                    <Button type="submit" disabled={!entityId.trim() || entity.isPending}>
                        {entity.isPending ? <Loader2 className="animate-spin" /> : <Search />}Look
                        up
                    </Button>
                </form>
                <ErrorLine error={entity.error} />
                {entity.data && (
                    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
                        <dl className="space-y-1.5 rounded-md bg-muted p-3 font-mono text-xs">
                            {Object.entries(entity.data.entity).map(([k, v]) => (
                                <div key={k}>
                                    <dt className="text-muted-foreground">{k}</dt>
                                    <dd className="break-all">{String(v)}</dd>
                                </div>
                            ))}
                        </dl>
                        <DataTable
                            headers={["Connected entity", "Kind", "Reference", "Amount (minor)"]}
                        >
                            {entity.data.connected.map((n) => (
                                <tr key={String(n["id"])}>
                                    <td className={`${cell} font-mono text-xs`}>
                                        <button
                                            className="text-primary underline"
                                            onClick={() => {
                                                setEntityId(String(n["id"]));
                                            }}
                                        >
                                            {String(n["id"])}
                                        </button>
                                    </td>
                                    <td className={cell}>{String(n["kind"] ?? "—")}</td>
                                    <td className={cell}>{String(n["reference"] ?? "—")}</td>
                                    <td className={`${cell} num`}>
                                        {n["amount_minor"] == null
                                            ? "—"
                                            : String(n["amount_minor"])}
                                    </td>
                                </tr>
                            ))}
                        </DataTable>
                    </div>
                )}
            </section>
            <section className="space-y-3 rounded-lg border bg-card p-5">
                <h2 className="flex items-center gap-2 text-sm font-medium">
                    <RouteIcon className="size-4 text-primary" />
                    How are two entities connected?
                </h2>
                <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (from.trim() && to.trim()) paths.mutate();
                    }}
                >
                    <Input
                        aria-label="From entity"
                        className="max-w-xs"
                        placeholder="From ID"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                    />
                    <Input
                        aria-label="To entity"
                        className="max-w-xs"
                        placeholder="To ID"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                    />
                    <Button
                        type="submit"
                        variant="outline"
                        disabled={!from.trim() || !to.trim() || paths.isPending}
                    >
                        Find paths
                    </Button>
                </form>
                <ErrorLine error={paths.error} />
                {paths.data &&
                    (paths.data.paths.length ? (
                        <ul className="space-y-1 font-mono text-xs">
                            {paths.data.paths.map((p, i) => (
                                <li key={i}>{p.join("  →  ")}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No connection within 6 hops.
                        </p>
                    ))}
            </section>
        </Page>
    );
}
