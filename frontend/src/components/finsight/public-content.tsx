import { Upload, GitMerge, Users, AlertTriangle, LineChart, FileText } from "lucide-react";
export const productFeatures = [
    {
        Icon: Upload,
        title: "Bring records together",
        text: "Import a CSV and keep each transaction linked to its original file and row.",
        to: "/app/sources",
    },
    {
        Icon: GitMerge,
        title: "Review with context",
        text: "Compare proposed invoice matches, confidence signals and payment differences.",
        to: "/app/reconciliation",
    },
    {
        Icon: Users,
        title: "Know your counterparties",
        text: "See customer and vendor activity across sources, with totals separated by currency.",
        to: "/app/counterparties",
    },
    {
        Icon: AlertTriangle,
        title: "Investigate the exceptions",
        text: "Work through sample duplicate payments, unmatched credits and FX shortfalls.",
        to: "/app/anomalies",
    },
    {
        Icon: LineChart,
        title: "Explore cash scenarios",
        text: "Adjust weekly inflows and outflows to compare a scenario with its baseline.",
        to: "/app/forecast",
    },
    {
        Icon: FileText,
        title: "Close with a clear record",
        text: "Export reports and follow approval decisions in the session activity log.",
        to: "/app/reports",
    },
] as const;
export const faqs = [
    {
        q: "Is FinSight connected to real data?",
        a: "Yes. Signed-in users work with their tenant's live data through the FinSight API: uploads, reconciliation, the review queue, AI answers, the audit trail and more. Visitors who aren't signed in can explore a clearly labelled sample workspace.",
    },
    {
        q: "How do I sign in?",
        a: "With your organisation's FinSight API client (client ID and secret), issued by an administrator. The secret is exchanged on our server for a short-lived session kept in a secure cookie; it is never stored in your browser. Individual user accounts and self-service sign-up are on the roadmap.",
    },
    {
        q: "What can I upload?",
        a: "Bank statements, mobile-money exports, invoices and accounting exports as CSV, JSON, Excel (.xlsx/.xls), PDF or text, up to 50 MB per file. FinSight detects columns, currencies and counterparties automatically and keeps a link from every record back to its source file.",
    },
    {
        q: "Which currencies are supported?",
        a: "Records keep their own ISO 4217 currency. The display currency converts totals using clearly labelled illustrative rates; original amounts are never changed, including in exports.",
    },
    {
        q: "Does Ask FinSight use live AI?",
        a: "Yes, when the workspace's AI provider is configured. Answers are grounded in your latest reconciliation — the model narrates real figures and never invents them — and personal data is redacted before anything is sent to the AI provider. Without a provider, answers fall back to an offline summary.",
    },
    {
        q: "Can developers use the API?",
        a: "Yes. The Developers page has a live request explorer and lets you issue API keys scoped to what your own credentials allow. The full OpenAPI reference is linked from there.",
    },
];
