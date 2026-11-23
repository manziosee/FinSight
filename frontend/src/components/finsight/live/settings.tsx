import { useSession } from "@/components/finsight/session";
import { ApiGap, Page, Pill, SourceBadge } from "@/components/finsight/page-kit";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { currencies, isCurrency } from "@/lib/currency-display";

export function LiveSettings() {
    const { user, currency, setCurrency, apiUrl } = useSession();
    return (
        <Page
            title="Settings"
            subtitle="Your session and display preferences"
            actions={<SourceBadge live />}
        >
            <section className="grid gap-6 border-b pb-6 md:grid-cols-[240px_1fr]">
                <h2 className="text-sm font-medium">Signed in</h2>
                <dl className="grid max-w-2xl gap-4 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-xs text-muted-foreground">API client</dt>
                        <dd className="font-mono">{user?.name}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Tenant</dt>
                        <dd className="font-mono">{user?.tenantId}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">Scopes</dt>
                        <dd className="mt-1 flex flex-wrap gap-1">
                            {user?.scopes.map((s) => (
                                <Pill key={s}>{s}</Pill>
                            ))}
                        </dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">API</dt>
                        <dd className="font-mono text-xs">{apiUrl}</dd>
                    </div>
                </dl>
            </section>
            <section className="grid gap-6 border-b pb-6 md:grid-cols-[240px_1fr]">
                <h2 className="text-sm font-medium">Display currency</h2>
                <div className="max-w-xs">
                    <Select
                        value={currency}
                        onValueChange={(v) => {
                            if (isCurrency(v)) setCurrency(v);
                        }}
                    >
                        <SelectTrigger aria-label="Display currency">
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
                    <p className="mt-2 text-xs text-muted-foreground">
                        Used for converted totals; API amounts always keep their own currency.
                    </p>
                </div>
            </section>
            <ApiGap needs="organisation settings (name, base currency, fiscal year), users & roles (RBAC), SSO/MFA, notification preferences">
                Organisation-level settings, team members and roles aren't available in the API yet
                — FinSight currently authenticates API clients, not individual users.
            </ApiGap>
        </Page>
    );
}
