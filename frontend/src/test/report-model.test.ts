import { describe, it, expect } from "vitest";
import { buildReportModel } from "@/lib/report-model";
import { transactions } from "@/lib/demo-data";

describe("PDF financial reports", () => {
    it("preserves original USD evidence while converting report amounts to RWF", () => {
        const first = transactions[0];
        if (!first) throw new Error("Expected a sample transaction");
        const row = { ...first, amount: 150, currency: "USD" as const };
        const report = buildReportModel([row], "Transactions", "All", "RWF");
        expect(report.cells[0]?.[3]).toContain("150.00");
        expect(report.cells[0]?.[4]).toContain("210,000");
        expect(report.cells[0]?.[6]).toContain(row.file);
        expect(row.amount).toBe(150);
    });
    it("includes only unmatched records in the exceptions report", () => {
        const report = buildReportModel(transactions, "Exceptions", "All", "USD");
        expect(report.count).toBe(transactions.filter((r) => r.status !== "matched").length);
        expect(report.cells.every((r) => r[5] !== "matched")).toBe(true);
    });
    it("applies the source currency filter to PDF rows", () => {
        const report = buildReportModel(transactions, "Transactions", "USD", "EUR");
        expect(report.count).toBe(transactions.filter((r) => r.currency === "USD").length);
        expect(report.cells.every((r) => r[3]?.includes("USD"))).toBe(true);
    });
});
