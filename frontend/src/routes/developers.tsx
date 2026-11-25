import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, Code2, Copy, ExternalLink, KeyRound, Lock, Search, Unlock } from "lucide-react";
import { toast } from "sonner";
import { PublicHeader, PublicFooter } from "@/components/finsight/public-shell";
import { ErrorLine, pageHead } from "@/components/finsight/page-kit";
import { useSession } from "@/components/finsight/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { filterGroups, groupEndpoints, type Endpoint } from "@/lib/api-reference";

export const Route = createFileRoute("/developers")({
    head: () =>
        pageHead(
            "Developers",
            "Every FinSight API endpoint, the scope it needs, and how to authenticate. No sign-in required.",
        ),
    component: DevelopersReference,
});

const DOCS_SITE = "https://manziosee.github.io/FinSight/";

const METHOD_STYLE: Record<string, string> = {
    GET: "bg-success-soft text-success",
    POST: "bg-primary/10 text-primary",
    PUT: "bg-warning-soft text-warning",
    PATCH: "bg-warning-soft text-warning",
    DELETE: "bg-danger-soft text-danger",
};

async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success("Copied");
    } catch {
        toast.error("Clipboard unavailable");
    }
}

function DevelopersReference() {
    const { apiUrl, isLive } = useSession();
    const spec = useQuery({ queryKey: ["openapi"], queryFn: api.openapi, staleTime: 300_000 });
    const [query, setQuery] = useState("");
    const groups = useMemo(() => (spec.data ? groupEndpoints(spec.data) : []), [spec.data]);
    const shown = useMemo(() => filterGroups(groups, query), [groups, query]);
    const total = groups.reduce((n, g) => n + g.endpoints.length, 0);
    const base = apiUrl || "https://finsight-api-gateway.fly.dev";

    const quickstart = [
        "# 1. Exchange your client credentials for a token (valid ~15 minutes)",
        `curl -s -X POST ${base}/v1/auth/token \\`,
        "  -d grant_type=client_credentials \\",
        "  -d client_id=$FINSIGHT_CLIENT_ID -d client_secret=$FINSIGHT_CLIENT_SECRET",
        "",
        "# 2. Call any endpoint with it (or send an API key as X-API-Key)",
        `curl -s ${base}/v1/reconciliation/summary -H "Authorization: Bearer $TOKEN"`,
    ].join("\n");

    return (
        <>
            <PublicHeader />
            <main className="mx-auto max-w-6xl px-6 py-14">
                <p className="text-sm text-primary">FinSight API</p>
                <h1 className="mt-3 text-4xl font-semibold">Developers</h1>
                <p className="mt-4 max-w-2xl text-muted-foreground">
                    The complete FinSight REST API, read live from the gateway. Browse every
                    endpoint and the scope it needs; sign in only when you want to call them.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                    <Button asChild>
                        <a href={DOCS_SITE} target="_blank" rel="noreferrer">
                            <BookOpen />
                            Full reference
                            <ExternalLink />
                        </a>
                    </Button>
                    <Button asChild variant="outline">
                        <a href={`${base}/docs`} target="_blank" rel="noreferrer">
                            <Code2 />
                            Try it (Swagger)
                            <ExternalLink />
                        </a>
                    </Button>
                    <Button asChild variant="outline">
                        <a href={`${base}/openapi.json`} target="_blank" rel="noreferrer">
                            OpenAPI JSON
                            <ExternalLink />
                        </a>
                    </Button>
                    <Button asChild variant="ghost">
                        <Link to={isLive ? "/app/developers" : "/login"}>
                            <KeyRound />
                            {isLive ? "Request explorer & API keys" : "Sign in to call the API"}
                        </Link>
                    </Button>
                </div>

                <section className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
                    <div className="space-y-3 text-sm">
                        <h2 className="text-xl font-semibold">Authentication</h2>
                        <p className="text-muted-foreground">
                            Base URL <code className="font-mono text-foreground">{base}</code>.
                            Exchange a client ID and secret for a short-lived bearer token (OAuth2
                            client credentials), or send a scoped API key in the{" "}
                            <code className="font-mono">X-API-Key</code> header. Each endpoint needs
                            one scope; a token only carries the scopes its client was given.
                        </p>
                        <p className="text-muted-foreground">
                            Errors use RFC 7807 problem details. Uploads accept CSV, JSON, XLSX, PDF
                            and MT940.
                        </p>
                    </div>
                    <div className="relative rounded-lg border bg-muted/40">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1"
                            aria-label="Copy quick start"
                            onClick={() => void copy(quickstart)}
                        >
                            <Copy />
                        </Button>
                        <pre className="overflow-x-auto p-4 pr-12 font-mono text-xs leading-relaxed">
                            {quickstart}
                        </pre>
                    </div>
                </section>

                <section className="mt-14">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <h2 className="text-xl font-semibold">
                            Endpoints{" "}
                            {total > 0 && (
                                <span className="text-sm font-normal text-muted-foreground">
                                    ({total})
                                </span>
                            )}
                        </h2>
                        <label className="relative w-full max-w-xs">
                            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                            <Input
                                aria-label="Filter endpoints"
                                placeholder="Filter by path, scope or name"
                                className="pl-9"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </label>
                    </div>
                    {spec.isLoading && (
                        <p className="mt-6 text-sm text-muted-foreground">Loading the API…</p>
                    )}
                    {spec.error && (
                        <div className="mt-6 space-y-2 text-sm">
                            <ErrorLine error={spec.error} />
                            <p className="text-muted-foreground">
                                The full reference is still available at{" "}
                                <a className="text-primary underline" href={DOCS_SITE}>
                                    {DOCS_SITE}
                                </a>
                                .
                            </p>
                        </div>
                    )}
                    {spec.data && shown.length === 0 && (
                        <p className="mt-6 text-sm text-muted-foreground">
                            No endpoint matches “{query}”.
                        </p>
                    )}
                    <div className="mt-6 space-y-10">
                        {shown.map((g) => (
                            <div key={g.tag}>
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                    {g.title}
                                </h3>
                                <ul className="mt-3 divide-y border-y">
                                    {g.endpoints.map((e) => (
                                        <EndpointRow key={`${e.method} ${e.path}`} e={e} />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
            <PublicFooter />
        </>
    );
}

function EndpointRow({ e }: { e: Endpoint }) {
    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
            <span
                className={`w-16 shrink-0 rounded px-2 py-0.5 text-center font-mono text-xs font-semibold ${
                    METHOD_STYLE[e.method] ?? "bg-muted"
                }`}
            >
                {e.method}
            </span>
            <code className="min-w-0 break-all font-mono">{e.path}</code>
            <span className="text-muted-foreground">{e.summary}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                {e.public ? (
                    <>
                        <Unlock className="size-3.5" />
                        public
                    </>
                ) : (
                    <>
                        <Lock className="size-3.5" />
                        <code className="font-mono">{e.scope ?? "token"}</code>
                    </>
                )}
            </span>
        </li>
    );
}
