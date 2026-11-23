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

function useWorkspaceState() {
    const { currency, setCurrency, money, convert, total } = useSession();
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
    const settings = { ...preferences, currency };
    const setSettings: React.Dispatch<React.SetStateAction<typeof settings>> = (update) => {
        const next = typeof update === "function" ? update(settings) : update;
        setCurrency(next.currency);
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
