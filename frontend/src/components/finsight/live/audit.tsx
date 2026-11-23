import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { csvString, downloadFile } from "@/lib/workspace";
import {
    DataTable,
    Empty,
    ErrorLine,
    Page,
    Pill,
    SourceBadge,
    cell,
} from "@/components/finsight/page-kit";

export function LiveAudit() {
    const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.audit(1000) });
    const [q, setQ] = useState("");
    const rows = (audit.data ?? []).filter((e) =>
        `${e.actor} ${e.action} ${e.resource} ${e.outcome} ${e.producer}`
            .toLowerCase()
            .includes(q.toLowerCase()),
    );
    return (
        <Page
            title="Audit log"
            subtitle="Every state-changing API call in your tenant"
            actions={
                <>
                    <SourceBadge live />
                    <Button
                        variant="outline"
                        disabled={!rows.length}
                        onClick={() =>
                            downloadFile(
                                "finsight-audit.csv",
                                csvString(rows.map((e) => ({ ...e }))),
                            )
                        }
                    >
                        <Download />
                        Export
                    </Button>
                </>
            }
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Input
                    aria-label="Search audit log"
                    className="max-w-sm"
                    placeholder="Search actor, action, resource…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <Pill>{rows.length} events</Pill>
            </div>
            <ErrorLine error={audit.error} />
            <DataTable headers={["Time", "Actor", "Action", "Outcome", "Service"]}>
                {rows.map((e, i) => (
                    <tr key={`${e.occurred_at}-${i}`}>
                        <td className={`${cell} num whitespace-nowrap text-muted-foreground`}>
                            {new Date(e.occurred_at).toLocaleString()}
                        </td>
                        <td className={cell}>{e.actor}</td>
                        <td className={`${cell} font-mono text-xs`}>{e.action}</td>
                        <td className={cell}>
                            <Pill
                                tone={
                                    e.outcome === "allow"
                                        ? "success"
                                        : e.outcome === "deny"
                                          ? "danger"
                                          : "warning"
                                }
                            >
                                {e.outcome}
                            </Pill>
                        </td>
                        <td className={`${cell} text-muted-foreground`}>{e.producer}</td>
                    </tr>
                ))}
            </DataTable>
            {audit.isSuccess && !rows.length && <Empty>No matching events.</Empty>}
        </Page>
    );
}
