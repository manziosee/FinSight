import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
    ArrowRight,
    BookOpen,
    Check,
    ChevronDown,
    Copy,
    ExternalLink,
    KeyRound,
    Lock,
    Search,
    ShieldCheck,
    Unlock,
    Zap,
} from "lucide-react";
import { toast } from "sonner";
import { PublicHeader, PublicFooter } from "@/components/finsight/public-shell";
import { ErrorLine, pageHead } from "@/components/finsight/page-kit";
import { useSession } from "@/components/finsight/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { filterGroups, groupEndpoints, type Endpoint } from "@/lib/api-reference";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/developers")({
    head: () =>
        pageHead(
            "Developers",
            "Every FinSight API endpoint, the permission it needs, and how to authenticate. No sign-in required.",
        ),
    component: DevelopersReference,
});

const DOCS_SITE = "https://manziosee.github.io/FinSight/";
const DEFAULT_API = "https://finsight-api-gateway.fly.dev";

const METHOD_STYLE: Record<string, string> = {
    GET: "bg-success-soft text-success",
    POST: "bg-primary/10 text-primary",
    PUT: "bg-warning-soft text-warning",
    PATCH: "bg-warning-soft text-warning",
    DELETE: "bg-danger-soft text-danger",
};

async function copy(text: string, what = "Copied") {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(what);
    } catch {
        toast.error("Clipboard unavailable");
    }
}

const FEATURES = [
    {
        Icon: ShieldCheck,
        title: "OAuth2 or API keys",
        body: "Short-lived tokens from client credentials, or a scoped key in X-API-Key.",
    },
    {
        Icon: Lock,
        title: "Least privilege",
        body: "Each endpoint needs exactly one permission; tokens carry only what you grant.",
    },
    {
        Icon: Zap,
        title: "Predictable errors",
        body: "RFC 7807 problem details everywhere. Uploads take CSV, JSON, XLSX, PDF and MT940.",
    },
];

function DevelopersReference() {
    const { apiUrl, isLive } = useSession();
    const spec = useQuery({ queryKey: ["openapi"], queryFn: api.openapi, staleTime: 300_000 });
    const [query, setQuery] = useState("");
    const groups = useMemo(() => (spec.data ? groupEndpoints(spec.data) : []), [spec.data]);
    const shown = useMemo(() => filterGroups(groups, query), [groups, query]);
    const total = groups.reduce((n, g) => n + g.endpoints.length, 0);
    const base = apiUrl || DEFAULT_API;
    const [tab, setTab] = useState<"token" | "call">("token");

    const snippets = {
        token: [
            `curl -s -X POST ${base}/v1/auth/token \\`,
            "  -d grant_type=client_credentials \\",
            "  -d client_id=$FINSIGHT_CLIENT_ID \\",
            "  -d client_secret=$FINSIGHT_CLIENT_SECRET",
        ].join("\n"),
        call: [
            `curl -s ${base}/v1/reconciliation/summary \\`,
            '  -H "Authorization: Bearer $TOKEN"',
        ].join("\n"),
    };

    return (
        <>
            <PublicHeader />
            <main>
                <section className="relative overflow-hidden border-b">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_20%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]"
                    />
                    <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr_1fr] lg:items-center">
                        <div>
                            <p className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                                <span className="size-1.5 rounded-full bg-success" />
                                REST API · v1
                            </p>
                            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                                Build on FinSight
                            </h1>
                            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                                Upload statements, reconcile payments, and ask questions about your
                                money from your own systems.
                            </p>
                            <div className="mt-7 flex flex-wrap gap-2">
                                <Button asChild size="lg" className="group">
                                    <Link to={isLive ? "/app/developers" : "/login"}>
                                        <KeyRound />
                                        {isLive ? "Get an API key" : "Sign in to get a key"}
                                        <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                                    </Link>
                                </Button>
                                <Button asChild size="lg" variant="outline">
                                    <a href={DOCS_SITE} target="_blank" rel="noreferrer">
                                        <BookOpen />
                                        Guides
                                        <ExternalLink className="opacity-60" />
                                    </a>
                                </Button>
                                <Button asChild size="lg" variant="ghost">
                                    <a href={`${base}/docs`} target="_blank" rel="noreferrer">
                                        Try it live
                                        <ExternalLink className="opacity-60" />
                                    </a>
                                </Button>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-xl border bg-zinc-950 text-zinc-100 shadow-xl transition-transform duration-300 hover:-translate-y-1">
                            <div className="flex items-center gap-1 border-b border-white/10 px-3 py-2">
                                {(["token", "call"] as const).map((t, i) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setTab(t)}
                                        className={cn(
                                            "rounded-md px-2.5 py-1 text-xs transition-colors",
                                            tab === t
                                                ? "bg-white/10 text-white"
                                                : "text-zinc-400 hover:text-white",
                                        )}
                                    >
                                        {i + 1}. {t === "token" ? "Get a token" : "Call the API"}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    aria-label="Copy snippet"
                                    onClick={() => void copy(snippets[tab], "Snippet copied")}
                                    className="ml-auto rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                                >
                                    <Copy className="size-4" />
                                </button>
                            </div>
                            <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">
                                <span className="text-zinc-500">$ </span>
                                {snippets[tab]}
                            </pre>
                        </div>
                    </div>
                </section>

                <section className="mx-auto grid max-w-6xl gap-4 px-6 py-12 sm:grid-cols-3">
                    {FEATURES.map(({ Icon, title, body }) => (
                        <div key={title} className="lift rounded-xl border bg-card p-5">
                            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                                <Icon className="size-4" />
                            </span>
                            <h2 className="mt-4 font-medium">{title}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                        </div>
                    ))}
                </section>

                <section className="mx-auto max-w-6xl px-6 pb-20">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2 className="text-2xl font-semibold">Endpoints</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {total > 0
                                    ? `${total} endpoints in ${groups.length} areas`
                                    : "Everything the API can do"}
                                · base URL{" "}
                                <button
                                    type="button"
                                    className="font-mono text-foreground underline-offset-4 hover:underline"
                                    onClick={() => void copy(base, "Base URL copied")}
                                >
                                    {base}
                                </button>
                            </p>
                        </div>
                        <label className="relative w-full max-w-xs">
                            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                            <Input
                                aria-label="Filter endpoints"
                                placeholder="Search endpoints"
                                className="pl-9"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </label>
                    </div>

                    {spec.isLoading && (
                        <div className="mt-6 space-y-3">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
                            ))}
                        </div>
                    )}
                    {spec.error && (
                        <div className="mt-6 space-y-2 text-sm">
                            <ErrorLine error={spec.error} />
                            <p className="text-muted-foreground">
                                The guides are still available at{" "}
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
                    <div className="mt-6 space-y-4">
                        {shown.map((g) => (
                            <details
                                key={g.tag}
                                open
                                className="group/section overflow-hidden rounded-xl border bg-card"
                            >
                                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
                                    <h3 className="font-medium">{g.title}</h3>
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                        {g.endpoints.length}
                                    </span>
                                    <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open/section:rotate-180" />
                                </summary>
                                <ul className="divide-y border-t">
                                    {g.endpoints.map((e) => (
                                        <EndpointRow key={`${e.method} ${e.path}`} e={e} />
                                    ))}
                                </ul>
                            </details>
                        ))}
                    </div>
                </section>
            </main>
            <PublicFooter />
        </>
    );
}

function EndpointRow({ e }: { e: Endpoint }) {
    const [copied, setCopied] = useState(false);
    return (
        <li className="group flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3.5 text-sm transition-colors hover:bg-muted/40">
            <span
                className={cn(
                    "mt-0.5 w-16 shrink-0 rounded px-2 py-0.5 text-center font-mono text-xs font-semibold",
                    METHOD_STYLE[e.method] ?? "bg-muted",
                )}
            >
                {e.method}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <code className="break-all font-mono">{e.path}</code>
                    <button
                        type="button"
                        aria-label={`Copy ${e.path}`}
                        onClick={() => {
                            void copy(e.path, "Path copied");
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1200);
                        }}
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    >
                        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    </button>
                </div>
                <p className="mt-0.5 text-muted-foreground">{e.description || e.summary}</p>
            </div>
            <span
                className={cn(
                    "mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                    e.public ? "text-success" : "text-muted-foreground",
                )}
                title={e.public ? "No token needed" : "Permission your token needs"}
            >
                {e.public ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                {e.public ? "public" : (e.scope ?? "token")}
            </span>
        </li>
    );
}
