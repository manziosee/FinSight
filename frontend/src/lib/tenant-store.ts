import { useCallback, useEffect, useState } from "react";

/**
 * Small per-tenant browser store for things the API can't list yet (your uploads, your
 * latest reconciliation run, submitted action requests). Holds only IDs and labels — never
 * financial data or credentials — and survives reloads. Each use is listed in API-GAPS.md;
 * once a list endpoint exists the page should read from the API instead.
 */
const PREFIX = "finsight";

function storageKey(tenantId: string, key: string) {
    return `${PREFIX}:${tenantId}:${key}`;
}

export function readTenantValue<T>(tenantId: string, key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(storageKey(tenantId, key));
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

export function writeTenantValue<T>(tenantId: string, key: string, value: T) {
    try {
        window.localStorage.setItem(storageKey(tenantId, key), JSON.stringify(value));
    } catch {
        // storage unavailable (private mode / quota): the value just won't persist
    }
}

export function useTenantValue<T>(tenantId: string | undefined, key: string, fallback: T) {
    const [value, setValue] = useState<T>(fallback);
    useEffect(() => {
        if (tenantId) setValue(readTenantValue(tenantId, key, fallback));
        // fallback is a literal at every call site; re-read only when the tenant/key changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, key]);
    const update = useCallback(
        (next: T | ((prev: T) => T)) => {
            setValue((prev) => {
                const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
                if (tenantId) writeTenantValue(tenantId, key, resolved);
                return resolved;
            });
        },
        [tenantId, key],
    );
    return [value, update] as const;
}

export interface UploadRef {
    id: string;
    name: string;
    source: string;
    at: string;
}
export interface ActionRef {
    id: string;
    action: string;
    status: string;
    requiresApproval: boolean;
    detail: string;
    at: string;
    params: Record<string, unknown>;
}
