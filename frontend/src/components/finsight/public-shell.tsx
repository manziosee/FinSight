import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./status";
import { useSession } from "./session";
const links = [
    { to: "/how-it-works", label: "How it works" },
    { to: "/features", label: "Features" },
    { to: "/faq", label: "FAQ" },
] as const;
export function PublicHeader() {
    const [open, setOpen] = useState(false);
    const { user } = useSession();
    return (
        <header className="sticky top-4 z-30 mx-auto mb-4 mt-4 w-[calc(100%-2rem)] max-w-6xl rounded-lg border bg-background/95 shadow-sm backdrop-blur">
            <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
                <Link to="/" aria-label="FinSight home">
                    <Logo />
                </Link>
                <nav
                    aria-label="Main navigation"
                    className="hidden items-center gap-7 text-sm md:flex"
                >
                    {links.map((l) => (
                        <Link
                            key={l.to}
                            to={l.to}
                            className="text-muted-foreground hover:text-foreground"
                            activeProps={{ className: "text-primary" }}
                        >
                            {l.label}
                        </Link>
                    ))}
                    <Link
                        to="/app/developers"
                        className="text-muted-foreground hover:text-foreground"
                    >
                        Developers
                    </Link>
                </nav>
                <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                        <Link to="/login">{user ? user.name.split(" ")[0] : "Log in"}</Link>
                    </Button>
                    <Button asChild size="sm">
                        <Link to={user ? "/app" : "/register"}>
                            {user ? "Dashboard" : "Get started"}
                            <ArrowUpRight />
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={open ? "Close menu" : "Open menu"}
                        aria-expanded={open}
                        className="md:hidden"
                        onClick={() => setOpen((o) => !o)}
                    >
                        {open ? <X /> : <Menu />}
                    </Button>
                </div>
            </div>
            {open && (
                <nav aria-label="Mobile navigation" className="grid gap-1 border-t p-3">
                    {links.map((l) => (
                        <Button asChild variant="ghost" className="justify-start" key={l.to}>
                            <Link to={l.to} onClick={() => setOpen(false)}>
                                {l.label}
                            </Link>
                        </Button>
                    ))}
                    <Button asChild variant="ghost" className="justify-start">
                        <Link to="/app/developers">Developers</Link>
                    </Button>
                </nav>
            )}
        </header>
    );
}
export function PublicFooter() {
    const groups = [
        {
            title: "Workspace",
            links: [
                { to: "/app", label: "Overview" },
                { to: "/app/reconciliation", label: "Reconciliation" },
                { to: "/app/sources", label: "Sources & uploads" },
                { to: "/app/reports", label: "Reports" },
            ],
        },
        {
            title: "Explore",
            links: [
                { to: "/features", label: "Features" },
                { to: "/how-it-works", label: "How it works" },
                { to: "/app/forecast", label: "Cash forecast" },
                { to: "/app/developers", label: "Developer explorer" },
            ],
        },
        {
            title: "Information",
            links: [
                { to: "/faq", label: "Frequently asked questions" },
                { to: "/faq", label: "Data & privacy" },
                { to: "/register", label: "Get access" },
            ],
        },
    ] as const;
    return (
        <footer className="border-t bg-sidebar">
            <div className="mx-auto max-w-6xl px-6 py-14">
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
                    <div>
                        <Link to="/" aria-label="FinSight home">
                            <Logo />
                        </Link>
                        <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                            A clearer view of payments, invoices and cash. Built around the way
                            finance teams work.
                        </p>
                        <p className="mt-4 text-xs text-muted-foreground">
                            Kigali, Rwanda · English
                        </p>
                    </div>
                    {groups.map((g) => (
                        <div key={g.title}>
                            <h2 className="text-sm font-semibold">{g.title}</h2>
                            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                                {g.links.map((l) => (
                                    <li key={l.label}>
                                        <Link to={l.to} className="hover:text-primary">
                                            {l.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-xs text-muted-foreground">
                    <p>© 2026 FinSight. All rights reserved.</p>
                    <p className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-success" />
                        Connected to the FinSight API · sample workspace for visitors
                    </p>
                </div>
            </div>
        </footer>
    );
}
