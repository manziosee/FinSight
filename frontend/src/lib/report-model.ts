import type { Txn } from "./demo-data";
import { displayMoney, totalInCurrency } from "./currency-display";
import { formatMoney, type Currency } from "./money";

export type ReportKind = "Transactions" | "Exceptions" | "Source summary" | "Reconciliation run";
export type ReportModel = ReturnType<typeof buildReportModel>;
export function buildReportModel(
    records: Txn[],
    kind: ReportKind,
    filter: string,
    currency: Currency,
): {
    kind: ReportKind;
    filter: string;
    currency: Currency;
    headers: string[];
    cells: string[][];
    count: number;
    net: string;
    matched: number;
    review: number;
} {
    const rows = records.filter(
        (r) =>
            (filter === "All" || r.currency === filter) &&
            (kind !== "Exceptions" || r.status !== "matched"),
    );
    const headers =
        kind === "Source summary"
            ? ["Source", "Currency", "Records", "Original net", `Converted net (${currency})`]
            : [
                  "Date",
                  "Counterparty",
                  "Reference",
                  "Original amount",
                  `Converted (${currency})`,
                  "Status",
                  "Evidence",
              ];
    const cells =
        kind === "Source summary"
            ? [...new Set(rows.map((r) => `${r.sourceType}|${r.currency}`))].map((key) => {
                  const group = rows.filter((r) => `${r.sourceType}|${r.currency}` === key);
                  const first = group[0];
                  if (!first) return [];
                  const amount = group.reduce((sum, r) => sum + r.amount, 0);
                  return [
                      first.sourceType,
                      first.currency,
                      String(group.length),
                      formatMoney(amount, first.currency),
                      displayMoney(amount, first.currency, currency),
                  ];
              })
            : rows.map((r) => [
                  r.date,
                  r.counterparty,
                  r.reference,
                  formatMoney(r.amount, r.currency),
                  displayMoney(r.amount, r.currency, currency),
                  r.status,
                  `${r.file} · row ${r.row}`,
              ]);
    return {
        kind,
        filter,
        currency,
        headers,
        cells,
        count: rows.length,
        net: formatMoney(totalInCurrency(rows, currency), currency),
        matched: rows.filter((r) => r.status === "matched").length,
        review: rows.filter((r) => r.status !== "matched").length,
    };
}
