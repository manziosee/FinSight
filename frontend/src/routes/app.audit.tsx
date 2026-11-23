import { LiveAudit } from "@/components/finsight/live/audit";
import { useSession } from "@/components/finsight/session";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { Page, DataTable, Empty, Pill, pageHead, cell } from "@/components/finsight/page-kit";
import { csvString, downloadFile } from "@/lib/workspace";
export const Route = createFileRoute("/app/audit")({
    head: () =>
        pageHead(
            "Audit log",
            "Inspect sandbox activity across imports, reviews, exports and settings changes.",
        ),
    component: AuditPage,
});
function SampleAudit() {
    const { audit } = useWorkspace();
    const [q, setQ] = useState("");
    const rows = audit.filter((e) =>
        `${e.actor} ${e.action} ${e.target} ${e.detail}`.toLowerCase().includes(q.toLowerCase()),
    );
    return (
        <Page
            title="Audit log"
            subtitle="Session activity · UTC timestamps · not a permanent audit archive"
            actions={
                <Button
                    variant="outline"
                    onClick={() =>
                        downloadFile("finsight-audit.csv", csvString(rows.map((e) => ({ ...e }))))
                    }
                >
                    <Download />
                    Export log
                </Button>
            }
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Input
                    aria-label="Search audit log"
                    className="max-w-sm"
                    placeholder="Search action, actor or record…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <Pill>{rows.length} events</Pill>
            </div>
            <DataTable headers={["Time (UTC)", "Actor", "Action", "Target", "Detail"]}>
                {rows.map((e) => (
                    <tr key={e.id}>
                        <td className={`${cell} num whitespace-nowrap text-muted-foreground`}>
                            {e.date}
                        </td>
                        <td className={cell}>{e.actor}</td>
                        <td className={`${cell} font-medium`}>{e.action}</td>
                        <td className={`${cell} font-mono text-xs`}>{e.target}</td>
                        <td className={`${cell} text-muted-foreground`}>{e.detail}</td>
                    </tr>
                ))}
            </DataTable>
            {!rows.length && <Empty>No matching events.</Empty>}
        </Page>
    );
}

function AuditPage() {
    const { isLive } = useSession();
    return isLive ? <LiveAudit /> : <SampleAudit />;
}
