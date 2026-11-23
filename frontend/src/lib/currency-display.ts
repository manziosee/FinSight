import { CURRENCY_DECIMALS, formatMoney, type Currency } from "./money";
// Illustrative preview rates only; not market or accounting rates.
export const DEMO_RWF_PER_UNIT: Record<Currency, number> = {
    RWF: 1,
    USD: 1400,
    EUR: 1500,
    KES: 11,
    UGX: 0.38,
};
export const RATE_SET = "illustrative-preview-v1";
export const currencies = ["RWF", "USD", "EUR", "KES", "UGX"] as const;
export function isCurrency(value: string): value is Currency {
    return currencies.some((c) => c === value);
}
export function convertMoney(amount: number, from: Currency, to: Currency) {
    return (amount * DEMO_RWF_PER_UNIT[from]) / DEMO_RWF_PER_UNIT[to];
}
export function displayMoney(amount: number, from: Currency, to: Currency) {
    return formatMoney(convertMoney(amount, from, to), to);
}
export function totalInCurrency(items: { amount: number; currency: Currency }[], to: Currency) {
    return items.reduce((total, r) => total + convertMoney(r.amount, r.currency, to), 0);
}
export function displayProjection(amount: number, currency: Currency, target: Currency) {
    return {
        display_amount: Number(
            convertMoney(amount, currency, target).toFixed(CURRENCY_DECIMALS[target]),
        ),
        display_currency: target,
        rate_set: RATE_SET,
    };
}
export function isChunkLoadError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|Failed to load module script/i.test(
        message,
    );
}
