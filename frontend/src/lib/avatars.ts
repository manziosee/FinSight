/** Avatars a user can pick from the account menu. Stored per browser; no upload, no PII. */
export interface AvatarOption {
    id: string;
    label: string;
    /** Emoji shown in the circle; empty means the user's initials. */
    glyph: string;
    /** Tailwind background classes for the circle. */
    bg: string;
}

export const AVATARS: AvatarOption[] = [
    { id: "initials", label: "Initials", glyph: "", bg: "bg-primary text-primary-foreground" },
    { id: "lion", label: "Lion", glyph: "🦁", bg: "bg-amber-100 dark:bg-amber-900/40" },
    { id: "leopard", label: "Leopard", glyph: "🐆", bg: "bg-yellow-100 dark:bg-yellow-900/40" },
    { id: "giraffe", label: "Giraffe", glyph: "🦒", bg: "bg-orange-100 dark:bg-orange-900/40" },
    { id: "elephant", label: "Elephant", glyph: "🐘", bg: "bg-slate-200 dark:bg-slate-700/60" },
    { id: "zebra", label: "Zebra", glyph: "🦓", bg: "bg-zinc-100 dark:bg-zinc-700/60" },
    { id: "gorilla", label: "Gorilla", glyph: "🦍", bg: "bg-stone-200 dark:bg-stone-700/60" },
    { id: "eagle", label: "Eagle", glyph: "🦅", bg: "bg-sky-100 dark:bg-sky-900/40" },
    { id: "coffee", label: "Coffee", glyph: "☕", bg: "bg-amber-200 dark:bg-amber-800/50" },
    { id: "rocket", label: "Rocket", glyph: "🚀", bg: "bg-indigo-100 dark:bg-indigo-900/40" },
    { id: "chart", label: "Chart", glyph: "📈", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
    { id: "star", label: "Star", glyph: "⭐", bg: "bg-violet-100 dark:bg-violet-900/40" },
];

export function avatarById(id: string | null | undefined): AvatarOption {
    return AVATARS.find((a) => a.id === id) ?? AVATARS[0]!;
}

export function initialsOf(name: string | null | undefined): string {
    return (
        (name ?? "Guest")
            .replace(/[^A-Za-z0-9]/g, " ")
            .trim()
            .split(/\s+/)
            .map((w) => w[0]?.toUpperCase())
            .join("")
            .slice(0, 2) || "G"
    );
}

/** "tenant_demo" → "Demo workspace"; "acme_corp" → "Acme Corp". */
export function workspaceName(tenantId: string | null | undefined): string {
    if (!tenantId) return "Sample workspace";
    const words = tenantId
        .replace(/^tenant[_-]?/i, "")
        .split(/[_-]+/)
        .filter(Boolean)
        .map((w) => w[0]!.toUpperCase() + w.slice(1));
    if (!words.length) return "Workspace";
    return words.length === 1 ? `${words[0]} workspace` : words.join(" ");
}

/** "admin" → "Admin"; "demo-client" → "Demo Client". */
export function displayName(clientId: string | null | undefined): string {
    if (!clientId) return "Guest";
    return clientId
        .split(/[_.-]+/)
        .filter(Boolean)
        .map((w) => w[0]!.toUpperCase() + w.slice(1))
        .join(" ");
}
