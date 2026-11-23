import { describe, it, expect } from "vitest";
import { formatMoney, totalsByCurrency } from "@/lib/money";

describe("money", () => {
    it("RWF has no decimals", () => {
        expect(formatMoney(850000, "RWF")).toBe("RWF 850,000");
    });
    it("USD has two decimals", () => {
        expect(formatMoney(1250, "USD")).toBe("USD 1,250.00");
    });
    it("never adds different currencies together", () => {
        const t = totalsByCurrency([
            { amount: 100, currency: "RWF" },
            { amount: 5, currency: "USD" },
            { amount: 50, currency: "RWF" },
        ]);
        expect(t).toEqual({ RWF: 150, USD: 5 });
    });
});
