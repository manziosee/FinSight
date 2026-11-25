import {
    endOfDay,
    endOfMonth,
    format,
    isWithinInterval,
    parseISO,
    startOfDay,
    startOfMonth,
    startOfYear,
    subDays,
    subMonths,
} from "date-fns";

/** The reporting period chosen in the workspace header. */
export interface Period {
    from: Date;
    to: Date;
}

export interface PeriodPreset {
    id: string;
    label: string;
    range: (today: Date) => Period;
}

export const PERIOD_PRESETS: PeriodPreset[] = [
    {
        id: "7d",
        label: "Last 7 days",
        range: (t) => ({ from: startOfDay(subDays(t, 6)), to: endOfDay(t) }),
    },
    {
        id: "30d",
        label: "Last 30 days",
        range: (t) => ({ from: startOfDay(subDays(t, 29)), to: endOfDay(t) }),
    },
    {
        id: "90d",
        label: "Last 90 days",
        range: (t) => ({ from: startOfDay(subDays(t, 89)), to: endOfDay(t) }),
    },
    {
        id: "month",
        label: "This month",
        range: (t) => ({ from: startOfMonth(t), to: endOfDay(t) }),
    },
    {
        id: "last-month",
        label: "Last month",
        range: (t) => {
            const m = subMonths(t, 1);
            return { from: startOfMonth(m), to: endOfMonth(m) };
        },
    },
    {
        id: "ytd",
        label: "Year to date",
        range: (t) => ({ from: startOfYear(t), to: endOfDay(t) }),
    },
];

export const DEFAULT_PRESET = "90d";

export function defaultPeriod(today = new Date()): Period {
    return PERIOD_PRESETS.find((p) => p.id === DEFAULT_PRESET)!.range(today);
}

export function formatPeriod(p: Period): string {
    const sameYear = p.from.getFullYear() === p.to.getFullYear();
    return `${format(p.from, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(p.to, "d MMM yyyy")}`;
}

/** True when an ISO date (YYYY-MM-DD or full timestamp) falls inside the period. */
export function inPeriod(isoDate: string, p: Period): boolean {
    const d = parseISO(isoDate);
    if (Number.isNaN(d.getTime())) return false;
    return isWithinInterval(d, { start: startOfDay(p.from), end: endOfDay(p.to) });
}
