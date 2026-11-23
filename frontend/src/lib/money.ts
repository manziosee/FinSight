export type Currency = "RWF" | "USD" | "EUR" | "KES" | "UGX";

// Real minor-unit decimals per ISO 4217.
export const CURRENCY_DECIMALS: Record<Currency, number> = {
    RWF: 0,
    UGX: 0,
    USD: 2,
    EUR: 2,
    KES: 2,
};

export function formatMoney(amount: number, currency: Currency): string {
    const d = CURRENCY_DECIMALS[currency];
    const n = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
    }).format(Math.abs(amount));
    return `${amount < 0 ? "−" : ""}${currency} ${n}`;
}

/** Group totals per currency — never silently add different currencies. */
export function totalsByCurrency(items: { amount: number; currency: Currency }[]) {
    const out: Partial<Record<Currency, number>> = {};
    for (const i of items) out[i.currency] = (out[i.currency] ?? 0) + i.amount;
    return out;
}

/**
 * The FinSight API sends amounts as integer minor units. Today the backend scales EVERY
 * currency by 100 — including RWF and UGX, which have no minor unit (tracked in
 * frontend/API-GAPS.md). Keep the conversion here so fixing the backend means changing
 * this one constant to `10 ** decimalsFor(code)`.
 */
export const API_MINOR_UNIT_SCALE = 100;

export function fromApiMinor(minor: number): number {
    return minor / API_MINOR_UNIT_SCALE;
}

export function toApiMinor(amount: number): number {
    return Math.round(amount * API_MINOR_UNIT_SCALE);
}

export function decimalsFor(code: string): number {
    return code in CURRENCY_DECIMALS ? CURRENCY_DECIMALS[code as Currency] : 2;
}

/** Format any ISO 4217 code (the API can return currencies beyond the five display ones, or
 * XXX for "unknown"). */
export function formatAmount(amount: number, code: string): string {
    const d = decimalsFor(code);
    const n = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
    }).format(Math.abs(amount));
    return `${amount < 0 ? "−" : ""}${code} ${n}`;
}
