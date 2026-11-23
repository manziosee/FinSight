import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { buildReportModel } from "./report-model";

type Report = ReturnType<typeof buildReportModel>;
const width = 841.89,
    height = 595.28,
    margin = 36;

function reportColor(role: string) {
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(`--report-${role}`)
        .trim()
        .replace("#", "");
    const hex = value.length === 3 ? [...value].map((char) => char + char).join("") : value;
    if (!/^[\da-f]{6}$/i.test(hex))
        throw new Error("Report colors are unavailable. Please reload and try again.");
    return rgb(
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
    );
}
function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
    const lines: string[] = [];
    let line = "";
    for (const char of text.replace(/[\r\n\t]/g, " ")) {
        if (line && font.widthOfTextAtSize(line + char, size) > maxWidth) {
            lines.push(line.trimEnd());
            line = "";
        }
        line += char;
    }
    if (line || !lines.length) lines.push(line.trimEnd());
    return lines;
}
async function logoBytes() {
    const image = new Image();
    image.src = "/favicon.svg";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 192;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare the FinSight logo.");
    context.drawImage(image, 0, 0, 192, 192);
    const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Unable to prepare the logo."))),
            "image/png",
        ),
    );
    return blob.arrayBuffer();
}
export async function createReportPdf(report: Report, organization: string) {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const [fontResponse, logo] = await Promise.all([
        fetch("/fonts/space-grotesk.ttf"),
        logoBytes(),
    ]);
    if (!fontResponse.ok) throw new Error("Report font could not be loaded. Please try again.");
    const font = await pdf.embedFont(await fontResponse.arrayBuffer(), { subset: true });
    const mark = await pdf.embedPng(logo);
    const ink = reportColor("ink"),
        muted = reportColor("muted"),
        accent = reportColor("accent"),
        line = reportColor("line"),
        wash = reportColor("wash");
    pdf.setTitle(`${report.kind} · FinSight`);
    pdf.setAuthor("FinSight");
    pdf.setSubject(`${organization} · sandbox financial report`);
    const generated = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
    const widths =
        report.kind === "Source summary"
            ? [170, 80, 70, 210, 239.89]
            : [66, 115, 78, 111, 111, 67, 221.89];
    let page: PDFPage;
    let y = 0;
    const text = (value: string, x: number, baseline: number, size = 9, color = ink) =>
        page.drawText(value, { x, y: baseline, size, font, color });
    function newPage() {
        page = pdf.addPage([width, height]);
        page.drawRectangle({ x: 0, y: 0, width, height, color: reportColor("paper") });
        page.drawImage(mark, { x: margin, y: height - 70, width: 32, height: 32 });
        text("FinSight", margin + 42, height - 60, 20);
        text("SANDBOX REPORT", width - 153, height - 48, 9, accent);
        text(generated, width - 181, height - 65, 8, muted);
        text(report.kind, margin, height - 107, 22);
        const orgLines = wrap(organization, font, 10, width - 2 * margin);
        let baseline = height - 128;
        orgLines.forEach((value) => {
            text(value, margin, baseline, 10, muted);
            baseline -= 13;
        });
        baseline -= 6;
        text(
            `${report.count} records · ${report.matched} matched · ${report.review} need review · Net ${report.net}`,
            margin,
            baseline,
            10,
        );
        baseline -= 20;
        text(
            `Source currency: ${report.filter === "All" ? "All currencies" : report.filter} · Display currency: ${report.currency}`,
            margin,
            baseline,
            9,
            muted,
        );
        baseline -= 17;
        text(
            "Illustrative exchange rates, not live quotes. Original amounts and source evidence are preserved.",
            margin,
            baseline,
            8,
            muted,
        );
        y = baseline - 20;
        page.drawRectangle({
            x: margin,
            y: y - 28,
            width: width - 2 * margin,
            height: 28,
            color: accent,
        });
        let x = margin;
        report.headers.forEach((header, i) => {
            text(header, x + 7, y - 18, 8, reportColor("paper"));
            x += widths[i] ?? 0;
        });
        y -= 28;
    }
    newPage();
    report.cells.forEach((row, index) => {
        const wrapped = row.map((value, i) => wrap(value, font, 8, (widths[i] ?? 100) - 14));
        const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * 11 + 16;
        if (y - rowHeight < 57) newPage();
        if (index % 2 === 0)
            page.drawRectangle({
                x: margin,
                y: y - rowHeight,
                width: width - 2 * margin,
                height: rowHeight,
                color: wash,
            });
        let x = margin;
        wrapped.forEach((lines, i) => {
            lines.forEach((value, j) => text(value, x + 7, y - 15 - j * 11, 8));
            x += widths[i] ?? 0;
        });
        y -= rowHeight;
        page.drawLine({
            start: { x: margin, y },
            end: { x: width - margin, y },
            color: line,
            thickness: 0.4,
        });
    });
    const pages = pdf.getPages();
    pages.forEach((current, i) => {
        page = current;
        page.drawLine({
            start: { x: margin, y: 41 },
            end: { x: width - margin, y: 41 },
            color: line,
            thickness: 0.5,
        });
        text("FinSight · Demo data · Not an audited financial statement", margin, 25, 8, muted);
        text(`Page ${i + 1} of ${pages.length}`, width - 102, 25, 8, muted);
    });
    const bytes = await pdf.save();
    return new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
}
export async function deliverReportPdf(blob: Blob, filename: string) {
    const file = new File([blob], filename, { type: "application/pdf" });
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: filename });
            return;
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
        }
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
