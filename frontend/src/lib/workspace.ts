import Papa from "papaparse";
import { transactions, type Txn } from "./demo-data";
import { type Currency, totalsByCurrency, formatMoney } from "./money";
import { displayMoney, totalInCurrency } from "./currency-display";

export interface UploadRecord {
    id: string;
    name: string;
    source: string;
    rows: number;
    date: string;
    status: string;
}
export interface AuditEvent {
    id: string;
    date: string;
    actor: string;
    action: string;
    target: string;
    detail: string;
}
export interface Approval {
    id: string;
    counterparty: string;
    amount: number;
    currency: Currency;
    reason: string;
    maker: string;
    status: "Pending" | "Approved" | "Rejected";
    note: string;
}
export interface Anomaly {
    id: string;
    title: string;
    counterparty: string;
    amount: number;
    currency: Currency;
    severity: "High" | "Medium";
    detail: string;
    status: "Open" | "Investigating" | "Dismissed" | "Resolved";
}
export const initialUploads: UploadRecord[] = Array.from(
    new Set(transactions.map((t) => t.file)),
).map((name, i) => ({
    id: `UP-${i + 1}`,
    name,
    source: transactions.find((t) => t.file === name)?.sourceType ?? "Bank",
    rows: transactions.filter((t) => t.file === name).length,
    date: "2026-10-27 08:15",
    status: "Imported",
}));
export const initialApprovals: Approval[] = [
    {
        id: "AP-104",
        counterparty: "Kigali Fresh Foods",
        amount: 1500,
        currency: "RWF",
        reason: "Write off merchant fee difference · INV-2420",
        maker: "Demo accountant",
        status: "Pending",
        note: "",
    },
    {
        id: "AP-105",
        counterparty: "Akagera Tours",
        amount: 6500,
        currency: "RWF",
        reason: "Recognize FX difference · INV-2422",
        maker: "Demo accountant",
        status: "Pending",
        note: "",
    },
    {
        id: "AP-103",
        counterparty: "Umurage Traders",
        amount: 25000,
        currency: "RWF",
        reason: "Invoice adjustment · INV-2409",
        maker: "Demo accountant",
        status: "Approved",
        note: "Supporting receipt reviewed.",
    },
];
export const initialAnomalies: Anomaly[] = [
    {
        id: "AN-201",
        title: "Possible duplicate payment",
        counterparty: "Volcano Logistics",
        amount: 1180000,
        currency: "RWF",
        severity: "High",
        detail: "Two debits share the same counterparty, amount and reference within 24 hours. Compare the bank statement before resolving.",
        status: "Open",
    },
    {
        id: "AN-202",
        title: "Payment without an invoice",
        counterparty: "ABC Ltd",
        amount: 2400000,
        currency: "RWF",
        severity: "High",
        detail: "A bank credit has no single open invoice with the same amount. Two invoices may explain the split.",
        status: "Open",
    },
    {
        id: "AN-203",
        title: "Unusual round-amount transfer",
        counterparty: "Volcano Logistics",
        amount: 3000000,
        currency: "RWF",
        severity: "Medium",
        detail: "The payment exceeds INV-2425 by RWF 250,000. Confirm whether the excess is an advance.",
        status: "Open",
    },
    {
        id: "AN-204",
        title: "Foreign currency shortfall",
        counterparty: "Akagera Tours",
        amount: 412.5,
        currency: "USD",
        severity: "Medium",
        detail: "The sample Stripe settlement is below the expected USD amount. Check fees and the settlement exchange rate.",
        status: "Investigating",
    },
];
export const initialAudit: AuditEvent[] = [
    {
        id: "EV-003",
        date: "2026-10-27 08:15",
        actor: "Demo system",
        action: "Import completed",
        target: "momo_export_oct.csv",
        detail: "Sample mobile money records normalized.",
    },
    {
        id: "EV-002",
        date: "2026-10-27 08:12",
        actor: "Demo accountant",
        action: "Approval requested",
        target: "AP-104",
        detail: "Merchant fee difference submitted for review.",
    },
    {
        id: "EV-001",
        date: "2026-10-27 08:00",
        actor: "Demo system",
        action: "Workspace opened",
        target: "Imena Traders Ltd",
        detail: "Sandbox data initialized.",
    },
];
export function downloadFile(name: string, content: string, type = "text/csv") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvString(rows: Record<string, unknown>[]) {
    return Papa.unparse(rows, { escapeFormulae: true });
}
export function parseTransactions(text: string, filename: string): Txn[] {
    const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) => h.trim().toLowerCase(),
    });
    if (result.errors.length)
        throw new Error("The CSV contains malformed rows. Check the file and try again.");
    const fields = result.meta.fields ?? [];
    if (!["date", "counterparty", "amount", "currency"].every((f) => fields.includes(f)))
        throw new Error(
            "Required columns: date, counterparty, amount, currency. Reference and source are optional.",
        );
    if (!result.data.length) throw new Error("The file has no transaction rows.");
    return result.data.map((r, i) => {
        const currency = r["currency"]?.trim().toUpperCase();
        if (!["RWF", "USD", "EUR", "KES", "UGX"].includes(currency ?? ""))
            throw new Error(`Row ${i + 2}: currency must be RWF, USD, EUR, KES or UGX.`);
        const amount = Number(r["amount"]?.replaceAll(",", ""));
        if (!r["amount"]?.trim() || !Number.isFinite(amount))
            throw new Error(`Row ${i + 2}: enter a valid amount.`);
        const date = r["date"] ?? "";
        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Date.parse(date)) ||
            new Date(date).toISOString().slice(0, 10) !== date
        )
            throw new Error(`Row ${i + 2}: use a valid date in YYYY-MM-DD format.`);
        const counterparty = r["counterparty"]?.trim();
        if (!counterparty) throw new Error(`Row ${i + 2}: counterparty is missing.`);
        const source = r["source"];
        const sourceType: Txn["sourceType"] =
            source === "MTN MoMo" ||
            source === "Airtel Money" ||
            source === "Stripe" ||
            source === "QuickBooks"
                ? source
                : "Bank";
        return {
            id: `UP-${crypto.randomUUID()}`,
            date,
            counterparty,
            amount,
            currency: currency as Currency,
            reference: r["reference"] || "—",
            source: source || "CSV upload",
            sourceType,
            status: "review",
            confidence: 0,
            file: filename,
            row: i + 2,
            raw: r,
        };
    });
}
export function answerWorkspaceQuestion(question: string, records: Txn[], target?: Currency) {
    const q = question.toLowerCase();
    const source = q.includes("momo")
        ? "MTN MoMo"
        : q.includes("stripe")
          ? "Stripe"
          : q.includes("airtel")
            ? "Airtel Money"
            : q.includes("bank")
              ? "Bank"
              : null;
    let rows = source ? records.filter((t) => t.sourceType === source) : records;
    const party = [...new Set(records.map((t) => t.counterparty))].find((p) =>
        q.includes(p.toLowerCase()),
    );
    if (party) rows = rows.filter((t) => t.counterparty === party);
    if (/review|unmatched|exception|issue/.test(q))
        rows = rows.filter((t) => t.status !== "matched");
    else if (q.includes("matched")) rows = rows.filter((t) => t.status === "matched");
    if (q.includes("outflow") || q.includes("debit")) rows = rows.filter((t) => t.amount < 0);
    if (q.includes("inflow") || q.includes("credit")) rows = rows.filter((t) => t.amount > 0);
    if (
        !source &&
        !party &&
        !/total|transaction|review|unmatched|exception|matched|inflow|outflow|credit|debit/.test(q)
    )
        return {
            text: "I cannot answer that from the available sample transactions. No live AI service is connected.",
            rows: [] as Txn[],
        };
    const totals = totalsByCurrency(rows);
    const money = target
        ? displayMoney(totalInCurrency(rows, target), target, target)
        : Object.entries(totals)
              .map(([c, v]) => formatMoney(v, c as Currency))
              .join(" · ");
    return {
        text: rows.length
            ? `${rows.length} ${party ?? source ?? "workspace"} transactions match this question. Net recorded amount: ${money}. ${rows.filter((t) => t.status !== "matched").length} still need review. These figures come only from the records listed below, not account balances.`
            : "No available transactions match this question.",
        rows,
    };
}
export function forecastCash(
    opening: number,
    inflow: number,
    outflow: number,
    weeks: number,
    adjustment: number,
) {
    return Array.from({ length: weeks + 1 }, (_, i) => ({
        week: i === 0 ? "Today" : `Week ${i}`,
        balance: Math.round(opening + i * (inflow * (1 + adjustment / 100) - outflow)),
        baseline: Math.round(opening + i * (inflow - outflow)),
    }));
}
