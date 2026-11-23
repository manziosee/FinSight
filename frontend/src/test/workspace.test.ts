import { describe, expect, it } from "vitest";
import {
    answerWorkspaceQuestion,
    parseTransactions,
    forecastCash,
    csvString,
} from "@/lib/workspace";
import { transactions } from "@/lib/demo-data";
describe("Workspace data flows", () => {
    it("imports quoted counterparties and preserves currency, amount and lineage", () => {
        const rows = parseTransactions(
            'date,counterparty,amount,currency,reference\n2026-10-27,"Example, Ltd",1250.75,USD,INV-1',
            "test.csv",
        );
        expect(rows[0]).toMatchObject({
            counterparty: "Example, Ltd",
            amount: 1250.75,
            currency: "USD",
            status: "review",
            row: 2,
            file: "test.csv",
        });
    });
    it("rejects invalid amounts instead of importing zero", () => {
        expect(() =>
            parseTransactions("date,counterparty,amount,currency\n2026-10-27,ABC,,RWF", "test.csv"),
        ).toThrow("valid amount");
    });
    it("rejects dates that roll into another month", () => {
        expect(() =>
            parseTransactions(
                "date,counterparty,amount,currency\n2026-02-30,ABC,1,RWF",
                "test.csv",
            ),
        ).toThrow("valid date");
    });
    it("cites only the requested counterparty records", () => {
        const answer = answerWorkspaceQuestion("Show ABC Ltd activity", transactions);
        expect(answer.rows.length).toBe(5);
        expect(answer.rows.every((r) => r.counterparty === "ABC Ltd")).toBe(true);
    });
    it("models adjusted inflow independently of the baseline", () => {
        expect(forecastCash(100, 50, 30, 2, 20).at(-1)).toEqual({
            week: "Week 2",
            balance: 160,
            baseline: 140,
        });
    });
    it("escapes spreadsheet formula injection in exported data", () => {
        expect(csvString([{ counterparty: "=SUM(1,1)" }])).toContain("'=SUM(1,1)");
    });
});
