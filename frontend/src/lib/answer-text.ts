/** Turning an AI answer into display blocks: strips model citation markers such as
 * 【reconciliation_summary.matched】 and splits paragraphs from bullet lists. */

export type AnswerBlock =
    { kind: "p"; text: string } | { kind: "ul"; items: string[] } | { kind: "h"; text: string };

export function cleanAnswer(text: string): string {
    return text
        .replace(/【[^】]*】/g, "")
        .replace(/[ \t]+([.,;:!?])/g, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

export function answerBlocks(text: string): AnswerBlock[] {
    const blocks: AnswerBlock[] = [];
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => {
        if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
        para = [];
    };
    const flushList = () => {
        if (list.length) blocks.push({ kind: "ul", items: list });
        list = [];
    };
    for (const raw of cleanAnswer(text).split("\n")) {
        const line = raw.trim();
        const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        if (!line) {
            flushPara();
            flushList();
        } else if (bullet) {
            flushPara();
            list.push(bullet[1]!);
        } else if (heading) {
            flushPara();
            flushList();
            blocks.push({ kind: "h", text: heading[1]! });
        } else {
            flushList();
            para.push(line);
        }
    }
    flushPara();
    flushList();
    return blocks;
}

/** Splits **bold** spans so they can be rendered without dangerouslySetInnerHTML. */
export function boldSpans(text: string): { text: string; bold: boolean }[] {
    return text
        .split(/(\*\*[^*]+\*\*)/g)
        .filter(Boolean)
        .map((part) =>
            part.startsWith("**") && part.endsWith("**") && part.length > 4
                ? { text: part.slice(2, -2), bold: true }
                : { text: part, bold: false },
        );
}
