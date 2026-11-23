import { describe, it, expect } from "vitest";
import {
    convertMoney,
    totalInCurrency,
    displayProjection,
    isChunkLoadError,
} from "@/lib/currency-display";
describe("Selected currency conversion", () => {
    it("converts source amounts rather than relabeling them", () => {
        expect(convertMoney(1400000, "RWF", "USD")).toBe(1000);
        expect(convertMoney(1000, "USD", "RWF")).toBe(1400000);
    });
    it("converts mixed currency totals before adding", () => {
        expect(
            totalInCurrency(
                [
                    { amount: 1400000, currency: "RWF" },
                    { amount: 1000, currency: "USD" },
                ],
                "USD",
            ),
        ).toBe(2000);
    });
    it("retains original source values when creating an export projection", () => {
        const row = { amount: 1400000, currency: "RWF" as const };
        expect({ ...row, ...displayProjection(row.amount, row.currency, "USD") }).toMatchObject({
            amount: 1400000,
            currency: "RWF",
            display_amount: 1000,
            display_currency: "USD",
        });
    });
    it("recognizes missing page chunks but not ordinary failures", () => {
        expect(
            isChunkLoadError(
                new TypeError("Failed to fetch dynamically imported module: /assets/page.js"),
            ),
        ).toBe(true);
        expect(isChunkLoadError(new Error("Invalid amount"))).toBe(false);
    });
});
