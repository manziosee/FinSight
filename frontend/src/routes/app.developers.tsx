import { LiveDevelopers } from "@/components/finsight/live/developers";
import { useSession } from "@/components/finsight/session";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Code2, Copy, Play, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { Page, Pill, pageHead } from "@/components/finsight/page-kit";
import { downloadFile } from "@/lib/workspace";
import { toast } from "sonner";
export const Route = createFileRoute("/app/developers")({
    head: () =>
        pageHead(
            "Developers",
            "Inspect sample financial data responses and download a FinSight sandbox JSON payload.",
        ),
    component: DevelopersPage,
});
function SampleDevelopers() {
    const { records, uploads, anomalies } = useWorkspace();
    const [endpoint, setEndpoint] = useState("transactions"),
        [response, setResponse] = useState("");
    function run() {
        const data =
            endpoint === "transactions"
                ? records.slice(0, 5)
                : endpoint === "sources"
                  ? uploads
                  : anomalies;
        setResponse(
            JSON.stringify(
                {
                    environment: "sandbox",
                    simulated: true,
                    data,
                    total: endpoint === "transactions" ? records.length : data.length,
                },
                null,
                2,
            ),
        );
    }
    const request = `GET /v1/${endpoint}\nAccept: application/json\n\n// Example only — no hosted API or credentials are connected.`;
    async function copy() {
        try {
            await navigator.clipboard.writeText(request);
            toast.success("Example copied");
        } catch {
            toast.error("Clipboard unavailable in this browser");
        }
    }
    return (
        <Page
            title="Developers"
            subtitle="Sandbox explorer · simulated responses only"
            actions={
                <div className="flex items-center gap-2">
                    <Pill tone="warning">Live API not connected</Pill>
                    <Button asChild size="sm" variant="outline">
                        <Link to="/developers">All API endpoints</Link>
                    </Button>
                </div>
            }
        >
            <section className="border-y py-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Code2 className="size-5 text-primary" />
                    Request explorer
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Select
                        value={endpoint}
                        onValueChange={(v) => {
                            setEndpoint(v);
                            setResponse("");
                        }}
                    >
                        <SelectTrigger aria-label="Example endpoint" className="w-60">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {["transactions", "sources", "anomalies"].map((e) => (
                                <SelectItem key={e} value={e}>
                                    GET /v1/{e}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={run}>
                        <Play />
                        Run sample
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Copy request"
                        title="Copy request"
                        onClick={() => void copy()}
                    >
                        <Copy />
                    </Button>
                </div>
            </section>
            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                <section className="min-w-0">
                    <h2 className="mb-3 text-sm font-medium">Example request</h2>
                    <pre className="overflow-auto rounded-md bg-ink p-5 text-xs leading-relaxed text-ink-foreground">
                        {request}
                    </pre>
                </section>
                <section className="min-w-0">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-medium">Sample response</h2>
                        {response && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                    downloadFile(
                                        `finsight-${endpoint}.json`,
                                        response,
                                        "application/json",
                                    )
                                }
                            >
                                <Download />
                                JSON
                            </Button>
                        )}
                    </div>
                    <pre className="max-h-[520px] min-h-48 overflow-auto rounded-md border bg-muted p-5 text-xs leading-relaxed">
                        {response || "No sample response yet."}
                    </pre>
                </section>
            </div>
            <section className="grid gap-6 border-t pt-5 sm:grid-cols-2">
                <div>
                    <h2 className="text-sm font-medium">API keys</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        No live keys issued. Authentication is not configured.
                    </p>
                </div>
                <div>
                    <h2 className="text-sm font-medium">Webhooks</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        No delivery endpoints connected.
                    </p>
                </div>
            </section>
        </Page>
    );
}

function DevelopersPage() {
    const { isLive } = useSession();
    return isLive ? <LiveDevelopers /> : <SampleDevelopers />;
}
