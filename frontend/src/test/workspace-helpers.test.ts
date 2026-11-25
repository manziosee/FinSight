import { describe, expect, it } from "vitest";
import { answerBlocks, boldSpans, cleanAnswer } from "@/lib/answer-text";
import { PERIOD_PRESETS, defaultPeriod, formatPeriod, inPeriod } from "@/lib/period";
import { avatarById, displayName, initialsOf, workspaceName } from "@/lib/avatars";

describe("answer text", () => {
    it("strips model citation markers", () => {
        expect(cleanAnswer("Matched **8** records【reconciliation_summary.matched】.")).toBe(
            "Matched **8** records.",
        );
    });

    it("splits paragraphs, bullets and headings", () => {
        const blocks = answerBlocks("## Today\nAll good.\n\n- one\n* two\n1. three\nDone.");
        expect(blocks).toEqual([
            { kind: "h", text: "Today" },
            { kind: "p", text: "All good." },
            { kind: "ul", items: ["one", "two", "three"] },
            { kind: "p", text: "Done." },
        ]);
    });

    it("marks bold spans without HTML", () => {
        expect(boldSpans("a **b** c")).toEqual([
            { text: "a ", bold: false },
            { text: "b", bold: true },
            { text: " c", bold: false },
        ]);
    });
});

describe("period", () => {
    const today = new Date(2026, 10, 25, 15, 0);

    it("defaults to the last 90 days", () => {
        const p = defaultPeriod(today);
        expect(inPeriod("2026-10-15", p)).toBe(true);
        expect(inPeriod("2026-08-01", p)).toBe(false);
        expect(inPeriod("not a date", p)).toBe(false);
    });

    it("last month covers the whole previous month", () => {
        const p = PERIOD_PRESETS.find((x) => x.id === "last-month")!.range(today);
        expect(inPeriod("2026-10-01", p)).toBe(true);
        expect(inPeriod("2026-10-31", p)).toBe(true);
        expect(inPeriod("2026-11-01", p)).toBe(false);
        expect(formatPeriod(p)).toBe("1 Oct – 31 Oct 2026");
    });
});

describe("account display", () => {
    it("names clients and workspaces for people", () => {
        expect(displayName("admin")).toBe("Admin");
        expect(displayName("demo-client")).toBe("Demo Client");
        expect(workspaceName("tenant_demo")).toBe("Demo workspace");
        expect(workspaceName("acme_corp")).toBe("Acme Corp");
        expect(workspaceName(undefined)).toBe("Sample workspace");
        expect(initialsOf("Demo Client")).toBe("DC");
    });

    it("falls back to initials for unknown avatars", () => {
        expect(avatarById("nope").id).toBe("initials");
        expect(avatarById("lion").glyph).toBe("🦁");
    });
});
