import { Check, CircleDashed, X } from "lucide-react";
import type { Status } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const map = {
    matched: { label: "Matched", Icon: Check, cls: "bg-success-soft text-success" },
    review: { label: "Needs review", Icon: CircleDashed, cls: "bg-warning-soft text-warning" },
    exception: { label: "Exception", Icon: X, cls: "bg-danger-soft text-danger" },
} as const;

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
    const { label, Icon, cls } = map[status];
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                cls,
                className,
            )}
        >
            <Icon className="size-3" strokeWidth={3} aria-hidden />
            {label}
        </span>
    );
}

export function Logo({ className }: { className?: string }) {
    return (
        <span
            className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}
        >
            <img src="/favicon.svg" alt="" width={32} height={32} className="size-8 shrink-0" />
            FinSight
        </span>
    );
}
