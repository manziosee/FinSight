import { useState } from "react";
import {
    Bell,
    ChevronDown,
    Palette,
    ShieldCheck,
    SlidersHorizontal,
    UserRound,
} from "lucide-react";
import { useSession } from "@/components/finsight/session";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { Page, Pill } from "@/components/finsight/page-kit";
import { AvatarPicker, UserAvatar } from "@/components/finsight/user-menu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { currencies, isCurrency } from "@/lib/currency-display";
import { cn } from "@/lib/utils";

/** Friendly wording for each API scope, grouped the way people think about access. */
const SCOPE_LABELS: Record<string, string> = {
    "data:write": "Upload data",
    "transactions:read": "View transactions",
    "transactions:write": "Edit transactions",
    "payments:match": "Match payments",
    "reconciliation:run": "Run reconciliation",
    "reconciliation:read": "View reconciliation",
    "graph:read": "View counterparties",
    "anomalies:read": "View anomalies",
    "financial:ask": "Ask FinSight",
    "forecast:run": "Run forecasts",
    "actions:execute": "Request actions",
    "api-keys:write": "Manage API keys",
    "audit:read": "View audit log",
};

function Section({
    icon: Icon,
    title,
    description,
    children,
}: {
    icon: typeof Bell;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <section className="grid gap-6 rounded-xl border bg-card p-5 transition-shadow duration-200 hover:shadow-md md:grid-cols-[240px_1fr]">
            <div>
                <h2 className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4 text-primary" />
                    {title}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
            <div className="max-w-xl">{children}</div>
        </section>
    );
}

export function LiveSettings() {
    const { user, currency, setCurrency } = useSession();
    const { settings, setSettings } = useWorkspace();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [showAccess, setShowAccess] = useState(false);
    const scopes = user?.scopes ?? [];
    const fullAccess = scopes.length >= Object.keys(SCOPE_LABELS).length;

    return (
        <Page title="Settings" subtitle="Your profile, preferences and access">
            <Section icon={UserRound} title="Profile" description="How you appear in FinSight.">
                <div className="flex flex-wrap items-center gap-4">
                    <UserAvatar className="size-16 text-lg" />
                    <div className="min-w-0">
                        <p className="text-lg font-semibold">{user?.displayName}</p>
                        <p className="text-sm text-muted-foreground">{user?.title}</p>
                    </div>
                    <Button
                        variant="outline"
                        className="ml-auto"
                        onClick={() => setPickerOpen(true)}
                    >
                        <Palette />
                        Change avatar
                    </Button>
                </div>
            </Section>

            <Section
                icon={SlidersHorizontal}
                title="Display"
                description="Converted totals use illustrative rates; original amounts never change."
            >
                <label className="block max-w-xs text-sm">
                    Display currency
                    <Select
                        value={currency}
                        onValueChange={(v) => {
                            if (isCurrency(v)) setCurrency(v);
                        }}
                    >
                        <SelectTrigger aria-label="Display currency" className="mt-2">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {currencies.map((c) => (
                                <SelectItem key={c} value={c}>
                                    {c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
            </Section>

            <Section icon={Bell} title="Notifications" description="What FinSight tells you about.">
                <div className="space-y-4">
                    {[
                        {
                            key: "dailyBrief" as const,
                            label: "Daily brief",
                            hint: "An AI summary of your day, shown when you first sign in each day.",
                        },
                        {
                            key: "notifications" as const,
                            label: "Workspace notifications",
                            hint: "Unmatched records and exceptions in the bell menu.",
                        },
                    ].map((f) => (
                        <label
                            key={f.key}
                            className="flex items-start justify-between gap-4 text-sm"
                        >
                            <span>
                                <span className="font-medium">{f.label}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {f.hint}
                                </span>
                            </span>
                            <Switch
                                aria-label={f.label}
                                checked={settings[f.key]}
                                onCheckedChange={(v) => setSettings((s) => ({ ...s, [f.key]: v }))}
                            />
                        </label>
                    ))}
                </div>
            </Section>

            <Section
                icon={ShieldCheck}
                title="Access"
                description="What this account is allowed to do."
            >
                <div className="flex flex-wrap items-center gap-3">
                    <Pill tone="success">
                        {fullAccess ? "Full access" : `${scopes.length} permissions`}
                    </Pill>
                    <span className="text-sm text-muted-foreground">
                        {fullAccess
                            ? "You can use every part of FinSight."
                            : "Some areas may be read-only for you."}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        aria-expanded={showAccess}
                        onClick={() => setShowAccess((v) => !v)}
                    >
                        {showAccess ? "Hide details" : "Show details"}
                        <ChevronDown
                            className={cn("transition-transform", showAccess && "rotate-180")}
                        />
                    </Button>
                </div>
                {showAccess && (
                    <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                        {Object.entries(SCOPE_LABELS).map(([scope, label]) => {
                            const has = scopes.includes(scope);
                            return (
                                <li
                                    key={scope}
                                    className={cn(
                                        "flex items-center gap-2",
                                        !has && "text-muted-foreground line-through",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "size-1.5 rounded-full",
                                            has ? "bg-success" : "bg-muted-foreground",
                                        )}
                                    />
                                    {label}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Section>
            <AvatarPicker open={pickerOpen} onOpenChange={setPickerOpen} />
        </Page>
    );
}
