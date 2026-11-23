import { LiveAsk } from "@/components/finsight/live/ask";
import { useSession } from "@/components/finsight/session";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Send, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { Page, Pill, pageHead } from "@/components/finsight/page-kit";
import { answerWorkspaceQuestion } from "@/lib/workspace";
export const Route = createFileRoute("/app/ask")({
    head: () =>
        pageHead(
            "Ask FinSight",
            "Explore sample transaction totals and cited source records in FinSight.",
        ),
    component: AskPage,
});
function SampleAsk() {
    const { records, settings } = useWorkspace();
    const [q, setQ] = useState("");
    const [messages, setMessages] = useState<
        { question: string; answer: ReturnType<typeof answerWorkspaceQuestion> }[]
    >([]);
    function ask(question: string) {
        if (!question.trim()) return;
        setMessages((xs) => [
            ...xs,
            { question, answer: answerWorkspaceQuestion(question, records) },
        ]);
        setQ("");
    }
    return (
        <Page
            title="Ask FinSight"
            subtitle="Sample-data answers · live AI not connected"
            actions={
                <Button variant="ghost" disabled={!messages.length} onClick={() => setMessages([])}>
                    Clear conversation
                </Button>
            }
        >
            {!messages.length && (
                <section className="py-10">
                    <Sparkles className="mb-5 size-8 text-primary" />
                    <h2 className="text-xl font-medium">October’s financial activity</h2>
                    <div className="mt-6 flex flex-wrap gap-2">
                        {[
                            "Which transactions need review?",
                            "Total MoMo transactions",
                            "Show ABC Ltd activity",
                            "What are the USD Stripe inflows?",
                        ].map((s) => (
                            <Button key={s} variant="outline" onClick={() => ask(s)}>
                                {s}
                                <ArrowUpRight />
                            </Button>
                        ))}
                    </div>
                </section>
            )}
            <div className="space-y-7">
                {messages.map((m, i) => (
                    <section key={i} className="border-b pb-6">
                        <p className="mb-4 font-medium">{m.question}</p>
                        <div className="flex gap-3">
                            <Sparkles className="mt-1 size-5 shrink-0 text-primary" />
                            <div className="min-w-0 space-y-3">
                                <Pill>
                                    {m.answer.rows.length
                                        ? "Sample records cited"
                                        : "Insufficient data"}
                                </Pill>
                                <p className="max-w-3xl text-sm leading-relaxed">
                                    {
                                        answerWorkspaceQuestion(
                                            m.question,
                                            m.answer.rows,
                                            settings.currency,
                                        ).text
                                    }
                                </p>
                                {m.answer.rows.length > 0 && (
                                    <details className="text-xs text-muted-foreground">
                                        <summary className="cursor-pointer">
                                            Source evidence · {m.answer.rows.length} records
                                        </summary>
                                        <ul className="mt-3 space-y-2">
                                            {m.answer.rows.map((r) => (
                                                <li key={r.id}>
                                                    {r.counterparty} · {r.file} · row {r.row} ·{" "}
                                                    {r.reference}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                                <Button asChild variant="link" className="h-auto p-0">
                                    <Link to="/app/transactions">
                                        View transactions
                                        <ArrowUpRight />
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </section>
                ))}
            </div>
            <form
                className="flex gap-2 border-t pt-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    ask(q);
                }}
            >
                <Input
                    aria-label="Ask a question"
                    placeholder="Ask about a counterparty, source or transaction total…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <Button type="submit" size="icon" aria-label="Send question" disabled={!q.trim()}>
                    <Send />
                </Button>
            </form>
        </Page>
    );
}

function AskPage() {
    const { isLive } = useSession();
    return isLive ? <LiveAsk /> : <SampleAsk />;
}
