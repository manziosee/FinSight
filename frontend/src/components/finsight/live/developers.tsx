import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Code2, Copy, Play, KeyRound, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { useSession } from "@/components/finsight/session";
import { ApiGap, ErrorLine, Page, Pill, SourceBadge } from "@/components/finsight/page-kit";
import { useLatestRun } from "./common";

export function LiveDevelopers() {
    const { user, apiUrl } = useSession();
    const { runId } = useLatestRun();
    const endpoints = [
        "reconciliation/summary",
        "reconciliation/weights",
        "audit?limit=5",
        "actions/catalog",
        ...(runId ? [`reconciliation/${runId}`] : []),
    ];
    const [path, setPath] = useState(endpoints[0] ?? "");
    const call = useMutation({ mutationFn: () => api.raw(path) });
    const [keyName, setKeyName] = useState("");
    const [scopes, setScopes] = useState<string[]>([]);
    const createKey = useMutation({ mutationFn: () => api.createApiKey(keyName.trim(), scopes) });
    async function copy(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Copied");
        } catch {
            toast.error("Clipboard unavailable");
        }
    }
    return (
        <Page
            title="Developers"
            subtitle="Explore the live API and issue scoped API keys"
            actions={<SourceBadge live />}
        >
            <section className="space-y-3 border-y py-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Code2 className="size-5 text-primary" />
                    Request explorer
                </div>
                <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (path.trim()) call.mutate();
                    }}
                >
                    <span className="self-center font-mono text-sm text-muted-foreground">
                        GET /v1/
                    </span>
                    <Input
                        aria-label="Endpoint path"
                        list="endpoints"
                        className="max-w-md font-mono"
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                    />
                    <datalist id="endpoints">
                        {endpoints.map((e) => (
                            <option key={e} value={e} />
                        ))}
                    </datalist>
                    <Button type="submit" disabled={call.isPending}>
                        {call.isPending ? <Loader2 className="animate-spin" /> : <Play />}Send
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Copy as curl"
                        onClick={() =>
                            void copy(`curl -H "Authorization: Bearer $TOKEN" ${apiUrl}/v1/${path}`)
                        }
                    >
                        <Copy />
                    </Button>
                </form>
                {call.data && (
                    <p className="text-xs text-muted-foreground">
                        <Pill tone={call.data.status < 400 ? "success" : "danger"}>
                            {call.data.status}
                        </Pill>{" "}
                        in {call.data.ms} ms
                    </p>
                )}
                <pre className="max-h-[480px] min-h-40 overflow-auto rounded-md border bg-muted p-5 text-xs leading-relaxed">
                    {call.data
                        ? JSON.stringify(call.data.body, null, 2)
                        : "Send a request to see the live response."}
                </pre>
                <div className="flex flex-wrap gap-4">
                    <Button asChild variant="link" className="h-auto p-0">
                        <Link to="/developers">All endpoints and scopes</Link>
                    </Button>
                    {apiUrl && (
                        <Button asChild variant="link" className="h-auto p-0">
                            <a href={`${apiUrl}/docs`} target="_blank" rel="noreferrer">
                                Try it in Swagger
                                <ExternalLink />
                            </a>
                        </Button>
                    )}
                </div>
            </section>
            <section className="space-y-4">
                <h2 className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="size-4 text-primary" />
                    Create an API key
                </h2>
                <p className="text-sm text-muted-foreground">
                    Keys can only carry scopes you hold. The key is shown once — store it in your
                    secret manager.
                </p>
                <Input
                    aria-label="Key name"
                    className="max-w-sm"
                    placeholder="Key name, e.g. erp-sync"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                />
                <div className="grid max-w-3xl gap-2 sm:grid-cols-3">
                    {(user?.scopes ?? []).map((s) => (
                        <label key={s} className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={scopes.includes(s)}
                                onCheckedChange={(v) =>
                                    setScopes((xs) =>
                                        v === true ? [...xs, s] : xs.filter((x) => x !== s),
                                    )
                                }
                            />
                            {s}
                        </label>
                    ))}
                </div>
                <Button
                    disabled={!keyName.trim() || !scopes.length || createKey.isPending}
                    onClick={() => createKey.mutate()}
                >
                    {createKey.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
                    Create key
                </Button>
                <ErrorLine error={createKey.error ?? call.error} />
                {createKey.data && (
                    <div className="rounded-lg border border-warning bg-warning-soft p-4 text-sm">
                        <p className="font-medium">
                            {createKey.data.name} · {createKey.data.scopes.join(", ")}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                            <code className="break-all rounded bg-background px-2 py-1 text-xs">
                                {createKey.data.api_key}
                            </code>
                            <Button
                                size="icon"
                                variant="outline"
                                aria-label="Copy key"
                                onClick={() => void copy(createKey.data.api_key)}
                            >
                                <Copy />
                            </Button>
                        </div>
                        <p className="mt-2 text-xs">
                            Send it as <code>X-API-Key</code>. It won't be shown again.
                        </p>
                    </div>
                )}
            </section>
            <ApiGap needs="GET /v1/api-keys, DELETE /v1/api-keys/{id} (revoke/rotate), webhooks, usage metrics">
                Issued keys can't be listed, revoked or rotated from the API yet, and webhooks
                aren't available.
            </ApiGap>
        </Page>
    );
}
