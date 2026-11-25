import type { ReactNode } from "react";
import { Info, Radio, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { answerBlocks, boldSpans } from "@/lib/answer-text";
export function pageHead(title: string, description: string) {
    return {
        meta: [
            { title: `${title} · FinSight` },
            { name: "description", content: description },
            { property: "og:title", content: `${title} · FinSight` },
            { property: "og:description", content: description },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary_large_image" },
        ],
    };
}
export function Page({
    title,
    subtitle,
    actions,
    children,
    level = 1,
}: {
    title: ReactNode;
    subtitle: string;
    actions?: ReactNode;
    children: ReactNode;
    /** 2 when the page is shown inside another page. */
    level?: 1 | 2;
}) {
    const Heading = level === 1 ? "h1" : "h2";
    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Heading className="flex items-center gap-2 text-2xl font-semibold">
                        {title}
                    </Heading>
                    <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
                </div>
                {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
            </div>
            {children}
        </div>
    );
}
export function Metrics({ items }: { items: { label: string; value: string; detail?: string }[] }) {
    return (
        <dl className="grid grid-cols-2 gap-4 border-y py-5 lg:grid-cols-4">
            {items.map((i) => (
                <div key={i.label}>
                    <dt className="text-xs text-muted-foreground">{i.label}</dt>
                    <dd className="num mt-2 break-words text-xl font-semibold">{i.value}</dd>
                    {i.detail && <p className="mt-1 text-xs text-muted-foreground">{i.detail}</p>}
                </div>
            ))}
        </dl>
    );
}
export function Pill({
    children,
    tone = "neutral",
}: {
    children: ReactNode;
    tone?: "success" | "warning" | "danger" | "neutral";
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
                tone === "success"
                    ? "bg-success-soft text-success"
                    : tone === "warning"
                      ? "bg-warning-soft text-warning"
                      : tone === "danger"
                        ? "bg-danger-soft text-danger"
                        : "bg-muted text-muted-foreground",
            )}
        >
            {children}
        </span>
    );
}
export function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
    return (
        <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                        {headers.map((h) => (
                            <th className="whitespace-nowrap px-4 py-3 font-medium" key={h}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y">{children}</tbody>
            </table>
        </div>
    );
}
export const cell = "px-4 py-3";
export function Empty({ children }: { children: ReactNode }) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Marks data that comes from the live API vs the sample workspace. */
export function SourceBadge({ live }: { live: boolean }) {
    return live ? (
        <span className="inline-flex items-center gap-1 rounded bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
            <Radio className="size-3" />
            Live API
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <FlaskConical className="size-3" />
            Sample data
        </span>
    );
}

/** A capability the FinSight API doesn't offer yet. Keep in sync with frontend/API-GAPS.md.
 * Shown only in development builds: it is a note for builders, not for people using FinSight. */
export function ApiGap({ needs, children }: { needs: string; children: ReactNode }) {
    if (!import.meta.env.DEV) return null;
    return (
        <div
            role="note"
            className="flex gap-3 rounded-lg border border-dashed bg-muted/40 p-4 text-sm"
        >
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
                <p>{children}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">API needed: {needs}</p>
            </div>
        </div>
    );
}

/** Uniform error line for failed API calls. */
export function ErrorLine({ error }: { error: unknown }) {
    if (!error) return null;
    const message = error instanceof Error ? error.message : String(error);
    return (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {message}
        </p>
    );
}

function Inline({ text }: { text: string }) {
    return (
        <>
            {boldSpans(text).map((s, i) =>
                s.bold ? (
                    <strong key={i} className="font-semibold text-foreground">
                        {s.text}
                    </strong>
                ) : (
                    <span key={i}>{s.text}</span>
                ),
            )}
        </>
    );
}

/** An AI answer rendered as paragraphs, headings and bullets (no raw HTML). */
export function RichAnswer({ text, className }: { text: string; className?: string }) {
    return (
        <div
            className={cn("space-y-2 text-sm leading-relaxed [overflow-wrap:anywhere]", className)}
        >
            {answerBlocks(text).map((b, i) =>
                b.kind === "ul" ? (
                    <ul key={i} className="list-disc space-y-1 pl-5 marker:text-primary">
                        {b.items.map((item, j) => (
                            <li key={j}>
                                <Inline text={item} />
                            </li>
                        ))}
                    </ul>
                ) : b.kind === "h" ? (
                    <p key={i} className="pt-1 font-semibold">
                        <Inline text={b.text} />
                    </p>
                ) : (
                    <p key={i}>
                        <Inline text={b.text} />
                    </p>
                ),
            )}
        </div>
    );
}
