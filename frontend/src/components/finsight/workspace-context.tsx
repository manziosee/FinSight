import { createContext, useContext, useState, type ReactNode } from "react";
import { transactions, type Txn } from "@/lib/demo-data";
import {
    initialUploads,
    initialApprovals,
    initialAnomalies,
    initialAudit,
    type UploadRecord,
    type Approval,
    type Anomaly,
    type AuditEvent,
} from "@/lib/workspace";
import { useSession } from "./session";
import { defaultPeriod, type Period } from "@/lib/period";
import { useTenantValue } from "@/lib/tenant-store";

function useWorkspaceState() {
    const { currency, setCurrency, money, convert, total, user } = useSession();
    const [period, setPeriod] = useState<Period>(() => defaultPeriod());
    const [avatar, setAvatar] = useTenantValue<string>(
        user?.tenantId ?? "sample",
        `avatar:${user?.name ?? "guest"}`,
        "initials",
    );
    const [records, setRecords] = useState<Txn[]>(transactions);
    const [uploads, setUploads] = useState<UploadRecord[]>(initialUploads);
    const [approvals, setApprovals] = useState<Approval[]>(initialApprovals);
    const [anomalies, setAnomalies] = useState<Anomaly[]>(initialAnomalies);
    const [audit, setAudit] = useState<AuditEvent[]>(initialAudit);
    const [preferences, setPreferences] = useState({
        organization: "Imena Traders Ltd",
        language: "English",
        fiscal: "July",
        notifications: true,
        dailyBrief: true,
    });
    // The daily-brief choice outlives a reload, so it is kept per signed-in client.
    const [dailyBrief, setDailyBrief] = useTenantValue<boolean>(
        user?.tenantId ?? "sample",
        `daily-brief:${user?.name ?? "guest"}`,
        true,
    );
    const settings = { ...preferences, dailyBrief, currency };
    const setSettings: React.Dispatch<React.SetStateAction<typeof settings>> = (update) => {
        const next = typeof update === "function" ? update(settings) : update;
        setCurrency(next.currency);
        if (next.dailyBrief !== dailyBrief) setDailyBrief(next.dailyBrief);
        const { currency: _currency, ...rest } = next;
        setPreferences(rest);
    };
    const log = (action: string, target: string, detail: string) =>
        setAudit((xs) => [
            {
                id: crypto.randomUUID(),
                date: new Date().toISOString().slice(0, 19).replace("T", " "),
                actor: "Demo user",
                action,
                target,
                detail,
            },
            ...xs,
        ]);
    return {
        period,
        setPeriod,
        avatar,
        setAvatar,
        records,
        setRecords,
        uploads,
        setUploads,
        approvals,
        setApprovals,
        anomalies,
        setAnomalies,
        audit,
        log,
        settings,
        setSettings,
        money,
        convert,
        total,
    };
}
const WorkspaceContext = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const value = useWorkspaceState();
    return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
    const value = useContext(WorkspaceContext);
    if (!value) throw new Error("WorkspaceProvider is required");
    return value;
}
