import type { Currency } from "./money";

export type Status = "matched" | "review" | "exception";

export interface Txn {
    id: string;
    date: string;
    source: string;
    sourceType: "Bank" | "MTN MoMo" | "Airtel Money" | "Stripe" | "QuickBooks";
    counterparty: string;
    reference: string;
    amount: number;
    currency: Currency;
    status: Status;
    confidence: number;
    file: string;
    row: number;
    raw: Record<string, string>;
}

const cps = [
    "ABC Ltd",
    "Kigali Fresh Foods",
    "Inyange Industries",
    "Volcano Logistics",
    "Umurage Traders",
    "Nyamirambo Textiles",
    "Akagera Tours",
    "Rwanda Coffee Co",
];
const sources: Txn["sourceType"][] = ["Bank", "MTN MoMo", "Airtel Money", "Stripe", "QuickBooks"];
const statuses: Status[] = ["matched", "matched", "matched", "review", "exception"];

export const transactions: Txn[] = Array.from({ length: 36 }, (_, i) => {
    const st = sources[i % sources.length]!;
    const cp = cps[i % cps.length]!;
    const cur: Currency = st === "Stripe" ? "USD" : i % 7 === 0 ? "USD" : "RWF";
    const amount =
        cur === "USD"
            ? Math.round((150 + ((i * 937) % 4800)) * 100 + ((i * 37) % 100)) / 100
            : (25 + ((i * 7919) % 2400)) * 1000;
    const status = statuses[(i * 3) % statuses.length]!;
    const day = String(1 + (i % 26)).padStart(2, "0");
    const ref = `INV-${2400 + i}`;
    return {
        id: `TX-${10421 + i}`,
        date: `2026-10-${day}`,
        source:
            st === "Bank"
                ? "Bank of Kigali ••4821"
                : st === "MTN MoMo"
                  ? "MoMo Merchant 07••312"
                  : st === "Airtel Money"
                    ? "Airtel Money ••889"
                    : st,
        sourceType: st,
        counterparty: cp,
        reference: ref,
        amount: i % 4 === 3 ? -amount : amount,
        currency: cur,
        status,
        confidence:
            status === "matched"
                ? 96 + (i % 4)
                : status === "review"
                  ? 68 + (i % 20)
                  : 30 + (i % 25),
        file:
            st === "Bank"
                ? "bk_statement_oct.pdf"
                : st === "MTN MoMo"
                  ? "momo_export_oct.csv"
                  : `${st.toLowerCase().replace(" ", "_")}_oct.xlsx`,
        row: 12 + i * 3,
        raw: {
            "Txn Date": `${day}/10/2026`,
            Narration: `PMT ${cp.toUpperCase()} ${ref}`,
            "Cr Amt": String(Math.abs(amount)),
            Ccy: cur,
            Ref: `FT26${(i * 1301) % 99999}`,
        },
    };
});

export interface ReviewItem {
    id: string;
    payment: {
        counterparty: string;
        amount: number;
        currency: Currency;
        date: string;
        ref: string;
        source: string;
    };
    invoices: { no: string; amount: number; date: string }[];
    matchType: "Exact" | "Partial" | "Split" | "Over" | "Under" | "FX";
    confidence: number;
    signals: { label: string; value: string; ok: boolean }[];
    explanation: string;
    residual: number;
}

export const reviewQueue: ReviewItem[] = [
    {
        id: "R-1",
        payment: {
            counterparty: "ABC Ltd",
            amount: 2_400_000,
            currency: "RWF",
            date: "2026-10-14",
            ref: "PMT ABC LTD OCT",
            source: "Bank of Kigali",
        },
        invoices: [
            { no: "INV-2411", amount: 1_500_000, date: "2026-09-30" },
            { no: "INV-2418", amount: 900_000, date: "2026-10-05" },
        ],
        matchType: "Split",
        confidence: 91,
        signals: [
            { label: "Amount", value: "✓ sums exactly", ok: true },
            { label: "Reference", value: "72%", ok: true },
            { label: "Counterparty", value: "✓", ok: true },
            { label: "Date", value: "9 days apart", ok: false },
        ],
        explanation:
            "One bank credit from ABC Ltd equals the sum of two open invoices. The narration mentions October but not the invoice numbers.",
        residual: 0,
    },
    {
        id: "R-2",
        payment: {
            counterparty: "Kigali Fresh Foods",
            amount: 848_500,
            currency: "RWF",
            date: "2026-10-16",
            ref: "MOMO 0788•••312",
            source: "MTN MoMo",
        },
        invoices: [{ no: "INV-2420", amount: 850_000, date: "2026-10-12" }],
        matchType: "Under",
        confidence: 88,
        signals: [
            { label: "Amount", value: "−1,500", ok: false },
            { label: "Reference", value: "92%", ok: true },
            { label: "Counterparty", value: "✓", ok: true },
            { label: "Date", value: "4 days apart", ok: true },
        ],
        explanation:
            "MoMo payment is RWF 1,500 short of the invoice — consistent with the MTN merchant withdrawal fee. Suggest marking the difference as a fee.",
        residual: -1500,
    },
    {
        id: "R-3",
        payment: {
            counterparty: "Akagera Tours",
            amount: 1_250,
            currency: "USD",
            date: "2026-10-18",
            ref: "STRIPE ch_3Px",
            source: "Stripe",
        },
        invoices: [{ no: "INV-2422", amount: 1_640_000, date: "2026-10-10" }],
        matchType: "FX",
        confidence: 79,
        signals: [
            { label: "Amount", value: "FX 1,312 → ±0.4%", ok: true },
            { label: "Reference", value: "61%", ok: false },
            { label: "Counterparty", value: "✓", ok: true },
            { label: "Date", value: "8 days apart", ok: false },
        ],
        explanation:
            "USD payment converts to RWF 1,633,500 at the BNR rate on the payment date, leaving an FX difference of RWF 6,500.",
        residual: -6500,
    },
    {
        id: "R-4",
        payment: {
            counterparty: "Volcano Logistics",
            amount: 3_000_000,
            currency: "RWF",
            date: "2026-10-20",
            ref: "TRF VOLCANO",
            source: "Equity Bank",
        },
        invoices: [{ no: "INV-2425", amount: 2_750_000, date: "2026-10-15" }],
        matchType: "Over",
        confidence: 64,
        signals: [
            { label: "Amount", value: "+250,000", ok: false },
            { label: "Reference", value: "40%", ok: false },
            { label: "Counterparty", value: "✓", ok: true },
            { label: "Date", value: "5 days apart", ok: true },
        ],
        explanation:
            "Payment exceeds the only open invoice by RWF 250,000. It may be an advance payment or include a future invoice.",
        residual: 250000,
    },
];

export const trend = Array.from({ length: 12 }, (_, i) => ({
    week: `W${i + 30}`,
    matched: 820 + i * 38 + ((i * 53) % 90),
    unmatched: 210 - i * 11 + ((i * 17) % 30),
    inflow: 42 + i * 2.2 + ((i * 7) % 6),
    outflow: 35 + i * 1.6 + ((i * 5) % 7),
}));

export const attention = [
    {
        label: "3 ABC Ltd payments with no invoice",
        amount: 2_400_000,
        currency: "RWF" as Currency,
        status: "exception" as Status,
    },
    {
        label: "Possible duplicate payment to Volcano Logistics",
        amount: 1_180_000,
        currency: "RWF" as Currency,
        status: "exception" as Status,
    },
    {
        label: "Stripe payout short by FX difference",
        amount: 412.5,
        currency: "USD" as Currency,
        status: "review" as Status,
    },
    {
        label: "42 MoMo lines awaiting review",
        amount: 3_920_000,
        currency: "RWF" as Currency,
        status: "review" as Status,
    },
];
