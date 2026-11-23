import { LiveSettings } from "@/components/finsight/live/settings";
import { useSession } from "@/components/finsight/session";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Save, Building2, SlidersHorizontal, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { Page, Pill, pageHead } from "@/components/finsight/page-kit";
import { toast } from "sonner";
import { isCurrency, DEMO_RWF_PER_UNIT } from "@/lib/currency-display";
export const Route = createFileRoute("/app/settings")({
    head: () =>
        pageHead("Settings", "Adjust FinSight sandbox organization and notification preferences."),
    component: SettingsPage,
});
function SampleSettings() {
    const { settings, setSettings, log } = useWorkspace();
    const [draft, setDraft] = useState(settings);
    function save() {
        const organization = draft.organization.trim();
        if (!organization) return;
        setSettings({ ...draft, organization });
        log("Settings updated", organization, "Sandbox preferences saved for this session.");
        toast.success("Settings saved for this session");
    }
    return (
        <Page
            title="Settings"
            subtitle="Sandbox preferences · changes reset when refreshed"
            actions={
                <Button
                    disabled={
                        !draft.organization.trim() ||
                        JSON.stringify(draft) === JSON.stringify(settings)
                    }
                    onClick={save}
                >
                    <Save />
                    Save changes
                </Button>
            }
        >
            <section className="grid gap-6 border-b pb-6 md:grid-cols-[240px_1fr]">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-medium">
                        <Building2 className="size-4 text-primary" />
                        Organization
                    </h2>
                    <Pill>Sandbox</Pill>
                </div>
                <div className="max-w-lg space-y-4">
                    <label className="block text-sm">
                        Organization name
                        <Input
                            className="mt-2"
                            value={draft.organization}
                            maxLength={80}
                            onChange={(e) =>
                                setDraft((d) => ({ ...d, organization: e.target.value }))
                            }
                        />
                    </label>
                    <p className="text-xs text-muted-foreground">
                        Team accounts and access roles are not connected.
                    </p>
                </div>
            </section>
            <section className="grid gap-6 border-b pb-6 md:grid-cols-[240px_1fr]">
                <h2 className="flex items-start gap-2 text-sm font-medium">
                    <SlidersHorizontal className="size-4 text-primary" />
                    Display preferences
                </h2>
                <div className="grid max-w-lg gap-4 sm:grid-cols-2">
                    <label className="text-sm">
                        Display currency
                        <Select
                            value={draft.currency}
                            onValueChange={(v) => {
                                if (isCurrency(v)) setDraft((d) => ({ ...d, currency: v }));
                            }}
                        >
                            <SelectTrigger aria-label="Display currency" className="mt-2 w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {["RWF", "USD", "EUR", "KES", "UGX"].map((c) => (
                                    <SelectItem key={c} value={c}>
                                        {c}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                    <div className="text-sm">
                        Interface language
                        <p className="mt-2 rounded-md border px-3 py-2">English</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                            French and Kinyarwanda translations are not available yet.
                        </p>
                    </div>
                    <div className="sm:col-span-2">
                        <p className="text-sm font-medium">Illustrative display rates</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                            {Object.entries(DEMO_RWF_PER_UNIT)
                                .map(([c, v]) => `1 ${c} = ${v} RWF`)
                                .join(" · ")}
                            . Not live market rates.
                        </p>
                    </div>
                </div>
            </section>
            <section className="grid gap-6 md:grid-cols-[240px_1fr]">
                <h2 className="flex items-start gap-2 text-sm font-medium">
                    <Bell className="size-4 text-primary" />
                    Notification preferences
                </h2>
                <div className="max-w-lg space-y-5">
                    {[
                        { key: "notifications" as const, label: "Workspace notifications" },
                        { key: "dailyBrief" as const, label: "Daily brief preference" },
                    ].map((f) => (
                        <label
                            key={f.key}
                            className="flex items-center justify-between gap-4 text-sm"
                        >
                            {f.label}
                            <Switch
                                aria-label={f.label}
                                checked={draft[f.key]}
                                onCheckedChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                            />
                        </label>
                    ))}
                    <p className="text-xs text-muted-foreground">
                        Preferences only; email delivery is not connected.
                    </p>
                </div>
            </section>
        </Page>
    );
}

function SettingsPage() {
    const { isLive } = useSession();
    return isLive ? <LiveSettings /> : <SampleSettings />;
}
