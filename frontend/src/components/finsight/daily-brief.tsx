import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
    ArrowUpRight,
    CheckCircle2,
    CircleAlert,
    Loader2,
    RefreshCw,
    Sparkles,
} from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/finsight/session";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { ErrorLine, RichAnswer } from "@/components/finsight/page-kit";
import { api } from "@/lib/api";
import { readTenantValue, writeTenantValue } from "@/lib/tenant-store";

export const BRIEF_QUESTION =
    "Give me a short briefing on how today is going: where reconciliation stands, " +
    "what needs my attention first, and one recommended next step. Use 3 to 5 bullet points.";

function greeting(now = new Date()) {
    const h = now.getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const todayKey = () => new Date().toISOString().slice(0, 10);

/** Opens the brief once per day per signed-in client, unless turned off in Settings. */
export function useAutoBrief(open: (o: boolean) => void) {
    const { user, isLive } = useSession();
    const { settings } = useWorkspace();
    useEffect(() => {
        if (!isLive || !user || !settings.dailyBrief) return;
        const key = `brief-seen:${user.name}`;
        if (readTenantValue<string | null>(user.tenantId, key, null) === todayKey()) return;
        writeTenantValue(user.tenantId, key, todayKey());
        const t = window.setTimeout(() => open(true), 900);
        return () => window.clearTimeout(t);
    }, [isLive, user, settings.dailyBrief, open]);
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
    return (
        <div className="rounded-lg border bg-card p-3 transition-transform duration-200 hover:-translate-y-0.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`num mt-1 text-xl font-semibold ${tone}`}>{value}</p>
        </div>
    );
}

export function DailyBrief({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { user, isLive } = useSession();
    const { records } = useWorkspace();
    const summary = useQuery({
        queryKey: ["summary"],
        queryFn: api.summary,
        enabled: isLive && open,
        retry: false,
    });
    const brief = useQuery({
        queryKey: ["daily-brief", user?.tenantId, todayKey()],
        queryFn: () => api.ask(BRIEF_QUESTION),
        enabled: isLive && open,
        staleTime: 15 * 60_000,
        retry: 1,
    });

    const s = summary.data?.has_data ? summary.data : null;
    const stats = isLive
        ? s
            ? { matched: s.matched, unmatched: s.unmatched, exceptions: s.exceptions }
            : null
        : {
              matched: records.filter((r) => r.status === "matched").length,
              unmatched: records.filter((r) => r.status === "review").length,
              exceptions: records.filter((r) => r.status === "exception").length,
          };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
                            <Sparkles className="size-4" />
                        </span>
                        {greeting()}, {user?.displayName ?? "there"}
                    </SheetTitle>
                    <SheetDescription>
                        Here's how today is going ·{" "}
                        {new Date().toLocaleDateString(undefined, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                        })}
                    </SheetDescription>
                </SheetHeader>
                <div className="space-y-5 px-4 pb-6">
                    {stats && (
                        <div className="grid grid-cols-3 gap-2">
                            <Stat label="Matched" value={stats.matched} tone="text-success" />
                            <Stat label="Unmatched" value={stats.unmatched} tone="text-warning" />
                            <Stat label="Exceptions" value={stats.exceptions} tone="text-danger" />
                        </div>
                    )}

                    <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-4">
                        <p className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            FinSight AI
                            {isLive && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7"
                                    aria-label="Refresh brief"
                                    disabled={brief.isFetching}
                                    onClick={() => void brief.refetch()}
                                >
                                    <RefreshCw className={brief.isFetching ? "animate-spin" : ""} />
                                </Button>
                            )}
                        </p>
                        {!isLive ? (
                            <SampleBrief stats={stats} />
                        ) : brief.isPending ? (
                            <div className="space-y-2" aria-live="polite">
                                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" />
                                    Reading your latest figures…
                                </p>
                                <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-9/12 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-10/12 animate-pulse rounded bg-muted" />
                            </div>
                        ) : brief.error ? (
                            <ErrorLine error={brief.error} />
                        ) : (
                            <RichAnswer text={brief.data?.answer ?? ""} />
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button asChild onClick={() => onOpenChange(false)}>
                            <Link to="/app/ask">
                                <Sparkles />
                                Ask a follow-up
                            </Link>
                        </Button>
                        <Button asChild variant="outline" onClick={() => onOpenChange(false)}>
                            <Link to="/app/reconciliation">
                                Review matches
                                <ArrowUpRight />
                            </Link>
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Shown once a day when you sign in. Turn it off in Settings → Daily brief.
                    </p>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function SampleBrief({
    stats,
}: {
    stats: { matched: number; unmatched: number; exceptions: number } | null;
}) {
    if (!stats) return null;
    const total = stats.matched + stats.unmatched + stats.exceptions;
    const rate = total ? Math.round((stats.matched / total) * 100) : 0;
    return (
        <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                {rate}% of {total} sample records are matched.
            </li>
            <li className="flex gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                {stats.unmatched} need a review and {stats.exceptions} are exceptions.
            </li>
            <li className="flex gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                Sign in to get an AI brief on your live data.
            </li>
        </ul>
    );
}
