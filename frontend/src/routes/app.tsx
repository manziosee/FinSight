import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    LayoutDashboard,
    GitMerge,
    Table2,
    Upload,
    Users,
    AlertTriangle,
    LineChart,
    CheckSquare,
    FileText,
    ScrollText,
    Code2,
    Settings,
    Search,
    Bell,
    Moon,
    Sun,
    ChevronsUpDown,
    Sparkles,
    Calendar,
    LogOut,
    LogIn,
    Loader2,
} from "lucide-react";
import { Logo } from "@/components/finsight/status";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceProvider, useWorkspace } from "@/components/finsight/workspace-context";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";
import { useSession } from "@/components/finsight/session";
import { currencies, isCurrency } from "@/lib/currency-display";
import { api } from "@/lib/api";
import { SourceBadge } from "@/components/finsight/page-kit";

export const Route = createFileRoute("/app")({
    head: () => ({
        meta: [
            { title: "FinSight workspace" },
            {
                name: "description",
                content: "FinSight workspace: reconciliation, sources, anomalies and reports.",
            },
            { property: "og:title", content: "FinSight workspace" },
            {
                property: "og:description",
                content: "FinSight workspace: reconciliation, sources, anomalies and reports.",
            },
        ],
    }),
    component: AppLayout,
});

const nav = [
    { to: "/app", label: "Home", Icon: LayoutDashboard, live: true },
    { to: "/app/reconciliation", label: "Reconciliation", Icon: GitMerge, live: true },
    { to: "/app/transactions", label: "Transactions", Icon: Table2, live: true },
    { to: "/app/sources", label: "Sources & uploads", Icon: Upload },
    { to: "/app/counterparties", label: "Counterparties", Icon: Users },
    { to: "/app/ask", label: "Ask FinSight", Icon: Sparkles },
    { to: "/app/anomalies", label: "Anomalies", Icon: AlertTriangle },
    { to: "/app/forecast", label: "Forecast", Icon: LineChart },
    { to: "/app/approvals", label: "Approvals", Icon: CheckSquare },
    { to: "/app/reports", label: "Reports", Icon: FileText },
    { to: "/app/audit", label: "Audit log", Icon: ScrollText },
    { to: "/app/developers", label: "Developers", Icon: Code2 },
    { to: "/app/settings", label: "Settings", Icon: Settings },
] as const;

function AppLayout() {
    return (
        <WorkspaceProvider>
            <WorkspaceLayout />
        </WorkspaceProvider>
    );
}

function WorkspaceLayout() {
    const { user, logout, setCurrency, currency, mode, isLive } = useSession();
    const { settings, anomalies, approvals } = useWorkspace();
    const health = useQuery({
        queryKey: ["health"],
        queryFn: api.health,
        refetchInterval: 60_000,
        retry: false,
    });
    const summary = useQuery({
        queryKey: ["summary"],
        queryFn: api.summary,
        enabled: isLive,
        retry: false,
    });
    const [open, setOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [logoutOpen, setLogoutOpen] = useState(false);
    const [read, setRead] = useState<string[]>([]);
    // Live: derived from the latest reconciliation run. Sample: from the sandbox records.
    const liveSummary = summary.data?.has_data ? summary.data : null;
    const liveNotices = liveSummary
        ? [
              ...(liveSummary.exceptions > 0
                  ? [
                        {
                            id: `exc-${liveSummary.run_id}`,
                            title: `${liveSummary.exceptions} match exceptions to review`,
                            detail: `Run ${liveSummary.run_id.slice(0, 8)}`,
                            to: "/app/reconciliation" as const,
                        },
                    ]
                  : []),
              ...(liveSummary.unmatched > 0
                  ? [
                        {
                            id: `unm-${liveSummary.run_id}`,
                            title: `${liveSummary.unmatched} unmatched records`,
                            detail: `Run ${liveSummary.run_id.slice(0, 8)}`,
                            to: "/app/reconciliation" as const,
                        },
                    ]
                  : []),
          ]
        : [];
    const sampleNotices = [
        ...anomalies
            .filter((a) => a.status === "Open" || a.status === "Investigating")
            .map((a) => ({
                id: a.id,
                title: a.title,
                detail: a.counterparty,
                to: "/app/anomalies" as const,
            })),
        ...approvals
            .filter((a) => a.status === "Pending")
            .map((a) => ({
                id: a.id,
                title: "Approval awaiting review",
                detail: a.counterparty,
                to: "/app/approvals" as const,
            })),
    ];
    const notices = settings.notifications ? (isLive ? liveNotices : sampleNotices) : [];
    const orgName = isLive && user ? user.title : settings.organization;
    const initials =
        (user?.name ?? "Guest")
            .replace(/[^A-Za-z0-9]/g, " ")
            .trim()
            .split(/\s+/)
            .map((w) => w[0]?.toUpperCase())
            .join("")
            .slice(0, 2) || "G";
    const unread = notices.filter((n) => !read.includes(n.id)).length;
    const [dark, setDark] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        return () => document.documentElement.classList.remove("dark");
    }, [dark]);

    return (
        <div className="flex min-h-screen bg-background">
            <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-3 text-sidebar-foreground md:flex">
                <Link to="/" className="px-2 py-2">
                    <Logo />
                </Link>
                <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto text-sm">
                    {nav.map((n) => (
                        <Link
                            key={n.label}
                            to={n.to}
                            activeOptions={{ exact: true }}
                            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sidebar-accent"
                            activeProps={{
                                className:
                                    "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                            }}
                        >
                            <n.Icon className="size-4" /> {n.label}
                        </Link>
                    ))}
                </nav>
                <div className="border-t p-3 text-xs">
                    <p className="flex items-center gap-2 font-medium">
                        FinSight workspace <SourceBadge live={isLive} />
                    </p>
                    <p className="mt-1 truncate text-muted-foreground">
                        {user ? `${user.name} · ${user.title}` : "Sample data · not signed in"}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                        <span
                            className={`size-1.5 rounded-full ${health.data?.ok ? "bg-success" : health.isPending ? "bg-muted-foreground" : "bg-danger"}`}
                        />
                        API{" "}
                        {health.data?.ok
                            ? `online${health.data.version ? ` · v${health.data.version}` : ""}`
                            : health.isPending
                              ? "checking…"
                              : "unreachable"}
                    </p>
                    {isLive ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mt-3 w-full justify-start"
                            onClick={() => setLogoutOpen(true)}
                        >
                            <LogOut />
                            Sign out
                        </Button>
                    ) : (
                        <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="mt-3 w-full justify-start"
                        >
                            <Link to="/login">
                                <LogIn />
                                Sign in
                            </Link>
                        </Button>
                    )}
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
                    <Button
                        asChild
                        variant="outline"
                        className="min-w-0 max-w-64 flex-1 sm:flex-none"
                    >
                        <Link to="/app/settings">
                            <span className="grid size-5 place-items-center rounded bg-accent text-[10px] font-bold text-accent-foreground">
                                {initials}
                            </span>
                            <span className="truncate">{orgName}</span>{" "}
                            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
                        </Link>
                    </Button>
                    <button
                        onClick={() => setOpen(true)}
                        className="ml-2 hidden flex-1 items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted sm:flex sm:max-w-sm"
                    >
                        <Search className="size-4" /> Search or jump to…
                        <kbd className="ml-auto rounded border bg-background px-1.5 text-[10px]">
                            ⌘K
                        </kbd>
                    </button>
                    <div className="ml-auto flex items-center gap-1">
                        <span className="hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm lg:flex">
                            <Calendar className="size-3.5" /> 01/10/2026 – 31/10/2026
                        </span>
                        <Select
                            value={currency}
                            onValueChange={(v) => {
                                if (isCurrency(v)) setCurrency(v);
                            }}
                        >
                            <SelectTrigger
                                aria-label="Workspace currency"
                                className="w-20 shrink-0"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {currencies.map((c) => (
                                    <SelectItem value={c} key={c}>
                                        {c}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Notifications"
                            onClick={() => setNotificationsOpen(true)}
                            className="relative"
                        >
                            <Bell />
                            {unread > 0 && (
                                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-danger" />
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Toggle theme"
                            onClick={() => setDark((d) => !d)}
                        >
                            {dark ? <Sun /> : <Moon />}
                        </Button>
                        {isLive ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Sign out"
                                title="Sign out"
                                className="md:hidden"
                                onClick={() => setLogoutOpen(true)}
                            >
                                <LogOut />
                            </Button>
                        ) : (
                            <Button asChild variant="ghost" size="icon" className="md:hidden">
                                <Link to="/login" aria-label="Sign in">
                                    <LogIn />
                                </Link>
                            </Button>
                        )}
                        <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="hidden md:inline-flex"
                        >
                            <Link to="/app/settings" aria-label="Account settings">
                                <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                                    {initials}
                                </span>
                            </Link>
                        </Button>
                    </div>
                </header>
                <nav
                    aria-label="Workspace pages"
                    className="flex gap-1 overflow-x-auto border-b px-3 py-2 md:hidden"
                >
                    {nav.map((n) => (
                        <Button asChild variant="ghost" size="sm" key={n.to}>
                            <Link
                                to={n.to}
                                activeOptions={{ exact: true }}
                                activeProps={{ className: "bg-accent text-accent-foreground" }}
                            >
                                <n.Icon />
                                {n.label}
                            </Link>
                        </Button>
                    ))}
                </nav>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground">
                    {isLive && user ? (
                        <span>
                            <SourceBadge live />{" "}
                            <span className="ml-1">
                                Signed in as{" "}
                                <strong className="font-medium text-foreground">{user.name}</strong>{" "}
                                · {user.title}
                            </span>
                        </span>
                    ) : mode === "sample" ? (
                        <span>
                            <SourceBadge live={false} />{" "}
                            <span className="ml-1">
                                You're exploring sample data.{" "}
                                <Link to="/login" className="text-primary underline">
                                    Sign in
                                </Link>{" "}
                                to work with your live FinSight data.
                            </span>
                        </span>
                    ) : null}
                    <span>
                        Display: {currency} · illustrative exchange rates for converted totals;
                        original amounts are unchanged.
                    </span>
                </p>
                <main className="flex-1 p-4 md:p-6">
                    {mode === "loading" ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            Checking your session…
                        </p>
                    ) : (
                        <Outlet />
                    )}
                </main>
            </div>

            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder="Search pages, counterparties, invoices…" />
                <CommandList>
                    <CommandEmpty>No results.</CommandEmpty>
                    <CommandGroup heading="Go to">
                        {nav.map((n) => (
                            <CommandItem
                                key={n.label}
                                onSelect={() => {
                                    setOpen(false);
                                    navigate({ to: n.to });
                                }}
                            >
                                <n.Icon /> {n.label}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                    {!isLive && (
                        <CommandGroup heading="Sample counterparties">
                            {["ABC Ltd", "Kigali Fresh Foods", "Volcano Logistics"].map((c) => (
                                <CommandItem
                                    key={c}
                                    onSelect={() => {
                                        setOpen(false);
                                        navigate({ to: "/app/transactions" });
                                    }}
                                >
                                    <Users /> {c}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                </CommandList>
            </CommandDialog>
            <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <SheetContent className="overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Notifications</SheetTitle>
                        <SheetDescription>
                            {settings.notifications
                                ? `${unread} unread · ${isLive ? "from your latest reconciliation run" : "sample workspace activity"}`
                                : "Notifications are turned off in Settings."}
                        </SheetDescription>
                    </SheetHeader>
                    <div className="px-4 pb-6">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={!unread}
                            onClick={() => setRead(notices.map((n) => n.id))}
                        >
                            Mark all as read
                        </Button>
                        <ul className="mt-3 divide-y">
                            {notices.map((n) => (
                                <li key={n.id} className="py-4">
                                    <Link
                                        to={n.to}
                                        className="block text-sm"
                                        onClick={() => {
                                            setRead((xs) => [...xs, n.id]);
                                            setNotificationsOpen(false);
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            {!read.includes(n.id) && (
                                                <span className="size-2 shrink-0 rounded-full bg-primary" />
                                            )}
                                            <span className="font-medium">{n.title}</span>
                                        </div>
                                        <p className="mt-1 text-muted-foreground">
                                            {n.detail} · {n.id}
                                        </p>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        {!notices.length && (
                            <p className="py-8 text-sm text-muted-foreground">
                                No notifications to show.
                            </p>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
            <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sign out of FinSight?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This ends your session on this device. Your data stays in FinSight.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Stay here</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setLogoutOpen(false);
                                void logout().finally(() =>
                                    navigate({ to: "/login", replace: true }),
                                );
                            }}
                        >
                            Sign out
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Toaster />
        </div>
    );
}
