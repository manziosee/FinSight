import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
    Sparkles,
    LogIn,
    Loader2,
    PanelLeftClose,
    PanelLeftOpen,
    Building2,
    UsersRound,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar, UserMenu } from "@/components/finsight/user-menu";
import { PeriodPicker } from "@/components/finsight/period-picker";
import { DailyBrief, useAutoBrief } from "@/components/finsight/daily-brief";
import { cn } from "@/lib/utils";

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
    { to: "/app/team", label: "Team", Icon: UsersRound },
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

const SIDEBAR_KEY = "finsight:sidebar-collapsed";

function useCollapsedSidebar() {
    const [collapsed, setCollapsed] = useState(false);
    useEffect(() => {
        try {
            setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
        } catch {
            // storage unavailable: start expanded
        }
    }, []);
    const toggle = useCallback(() => {
        setCollapsed((c) => {
            try {
                window.localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
            } catch {
                // not persisted
            }
            return !c;
        });
    }, []);
    return [collapsed, toggle] as const;
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
    const [briefOpen, setBriefOpen] = useState(false);
    const [collapsed, toggleSidebar] = useCollapsedSidebar();
    const [read, setRead] = useState<string[]>([]);
    useAutoBrief(setBriefOpen);
    // Live: derived from the latest reconciliation run. Sample: from the sandbox records.
    const liveSummary = summary.data?.has_data ? summary.data : null;
    const liveNotices = liveSummary
        ? [
              ...(liveSummary.exceptions > 0
                  ? [
                        {
                            id: `exc-${liveSummary.run_id}`,
                            title: `${liveSummary.exceptions} match exceptions to review`,
                            detail: "Latest reconciliation",
                            to: "/app/reconciliation" as const,
                        },
                    ]
                  : []),
              ...(liveSummary.unmatched > 0
                  ? [
                        {
                            id: `unm-${liveSummary.run_id}`,
                            title: `${liveSummary.unmatched} unmatched records`,
                            detail: "Latest reconciliation",
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
    const unread = notices.filter((n) => !read.includes(n.id)).length;
    const [dark, setDark] = useState(false);
    const navigate = useNavigate();
    const apiOk = health.data?.ok;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const k = e.key.toLowerCase();
            if (k === "k") {
                e.preventDefault();
                setOpen((o) => !o);
            } else if (k === "b") {
                e.preventDefault();
                toggleSidebar();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [toggleSidebar]);
    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        return () => document.documentElement.classList.remove("dark");
    }, [dark]);

    return (
        <TooltipProvider delayDuration={150}>
            <div className="flex min-h-screen bg-background">
                <aside
                    data-collapsed={collapsed}
                    className={cn(
                        "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar p-3 text-sidebar-foreground transition-[width] duration-300 ease-out md:flex",
                        collapsed ? "w-[68px]" : "w-60",
                    )}
                >
                    <div
                        className={cn(
                            "flex items-center",
                            collapsed ? "justify-center" : "justify-between",
                        )}
                    >
                        {!collapsed && (
                            <Link to="/" className="px-2 py-2 transition-opacity hover:opacity-80">
                                <Logo />
                            </Link>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                                    onClick={toggleSidebar}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                {collapsed ? "Expand" : "Collapse"} sidebar · Ctrl B
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden text-sm">
                        {nav.map((n) => {
                            const link = (
                                <Link
                                    key={n.label}
                                    to={n.to}
                                    activeOptions={{ exact: true }}
                                    aria-label={collapsed ? n.label : undefined}
                                    className={cn(
                                        "group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-all duration-200 hover:bg-sidebar-accent hover:pl-3",
                                        collapsed && "justify-center px-0 hover:pl-0",
                                    )}
                                    activeProps={{
                                        className:
                                            "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:left-0 before:top-1.5 before:h-[calc(100%-12px)] before:w-0.5 before:rounded-full before:bg-primary",
                                    }}
                                >
                                    <n.Icon className="size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                                    {!collapsed && <span className="truncate">{n.label}</span>}
                                </Link>
                            );
                            return collapsed ? (
                                <Tooltip key={n.label}>
                                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                                    <TooltipContent side="right">{n.label}</TooltipContent>
                                </Tooltip>
                            ) : (
                                link
                            );
                        })}
                    </nav>
                    <div
                        className={cn(
                            "mt-2 rounded-xl border bg-background/60 p-2",
                            collapsed && "border-0 bg-transparent p-0",
                        )}
                    >
                        <div
                            className={cn(
                                "flex items-center gap-2.5",
                                collapsed && "justify-center",
                            )}
                        >
                            <div className="relative">
                                <UserAvatar />
                                <span
                                    title={
                                        apiOk
                                            ? "Connected"
                                            : health.isPending
                                              ? "Checking…"
                                              : "Offline"
                                    }
                                    className={cn(
                                        "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar",
                                        apiOk
                                            ? "bg-success"
                                            : health.isPending
                                              ? "bg-muted-foreground"
                                              : "bg-danger",
                                    )}
                                />
                            </div>
                            {!collapsed && (
                                <div className="min-w-0 flex-1 text-xs">
                                    <p className="truncate text-sm font-medium">
                                        {user?.displayName ?? "Guest"}
                                    </p>
                                    <p className="truncate text-muted-foreground">
                                        {isLive ? orgName : "Sample data"}
                                    </p>
                                </div>
                            )}
                        </div>
                        {!collapsed && !isLive && (
                            <Button asChild size="sm" className="mt-2 w-full">
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
                        <div className="flex min-w-0 items-center gap-2 rounded-md px-1 text-sm">
                            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                                <Building2 className="size-4" />
                            </span>
                            <span className="hidden truncate font-medium sm:inline">{orgName}</span>
                        </div>
                        <button
                            onClick={() => setOpen(true)}
                            className="ml-2 hidden flex-1 items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted sm:flex sm:max-w-sm"
                        >
                            <Search className="size-4" /> Search or jump to…
                            <kbd className="ml-auto rounded border bg-background px-1.5 text-[10px]">
                                ⌘K
                            </kbd>
                        </button>
                        <div className="ml-auto flex items-center gap-1">
                            <PeriodPicker className="hidden lg:inline-flex" />
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
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Today's brief"
                                        onClick={() => setBriefOpen(true)}
                                        className="text-primary"
                                    >
                                        <Sparkles />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Today's brief</TooltipContent>
                            </Tooltip>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Notifications"
                                onClick={() => setNotificationsOpen(true)}
                                className="relative"
                            >
                                <Bell />
                                {unread > 0 && (
                                    <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
                                        {unread}
                                    </span>
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
                            <div className="ml-1">
                                <UserMenu
                                    onSignOut={() => setLogoutOpen(true)}
                                    onOpenBrief={() => setBriefOpen(true)}
                                />
                            </div>
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
                    <div className="border-b px-4 py-2 lg:hidden">
                        <PeriodPicker className="w-full justify-start sm:w-auto" />
                    </div>
                    {mode === "sample" && (
                        <p className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
                            <SourceBadge live={false} />
                            You're exploring sample data.
                            <Link to="/login" className="font-medium text-primary hover:underline">
                                Sign in
                            </Link>
                            to work with your live FinSight data.
                        </p>
                    )}
                    <main className="animate-in fade-in-0 flex-1 p-4 duration-300 md:p-6">
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
                                            <p className="mt-1 text-muted-foreground">{n.detail}</p>
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
                <DailyBrief open={briefOpen} onOpenChange={setBriefOpen} />
                <Toaster />
            </div>
        </TooltipProvider>
    );
}
