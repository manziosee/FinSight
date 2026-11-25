import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Send, ArrowUpRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Answer } from "@/lib/api";
import { ErrorLine, Page, Pill, RichAnswer } from "@/components/finsight/page-kit";
import { pct } from "./common";

const SUGGESTIONS = [
    "Which invoices are still open?",
    "Why are some payments unmatched?",
    "Who owes us the most?",
    "Summarise the latest reconciliation",
];

export function LiveAsk() {
    const [q, setQ] = useState("");
    const [messages, setMessages] = useState<{ question: string; answer: Answer }[]>([]);
    const ask = useMutation({
        mutationFn: (question: string) => api.ask(question),
        onSuccess: (answer, question) => {
            setMessages((xs) => [...xs, { question, answer }]);
            setQ("");
        },
    });
    const send = (question: string) => {
        if (question.trim() && !ask.isPending) ask.mutate(question.trim());
    };
    return (
        <Page
            title="Ask FinSight"
            subtitle="Answers grounded in your latest reconciliation — figures come from your data, never invented"
            actions={
                <>
                    <Button
                        variant="ghost"
                        disabled={!messages.length}
                        onClick={() => setMessages([])}
                    >
                        Clear
                    </Button>
                </>
            }
        >
            {!messages.length && (
                <section className="py-8">
                    <Sparkles className="mb-5 size-8 text-primary" />
                    <h2 className="text-xl font-medium">Ask about your money</h2>
                    <div className="mt-6 flex flex-wrap gap-2">
                        {SUGGESTIONS.map((s) => (
                            <Button
                                key={s}
                                variant="outline"
                                className="hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm"
                                onClick={() => send(s)}
                            >
                                {s}
                                <ArrowUpRight />
                            </Button>
                        ))}
                    </div>
                </section>
            )}
            <div className="space-y-7">
                {messages.map((m, i) => (
                    <section
                        key={i}
                        className="animate-in fade-in-0 slide-in-from-bottom-2 border-b pb-6 duration-300"
                    >
                        <p className="mb-4 font-medium">{m.question}</p>
                        <div className="flex gap-3">
                            <Sparkles className="mt-1 size-5 shrink-0 text-primary" />
                            <div className="min-w-0 space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    <Pill tone={m.answer.grounded ? "success" : "warning"}>
                                        {m.answer.grounded
                                            ? "Grounded in your data"
                                            : "Not enough data"}
                                    </Pill>
                                    <Pill>confidence {pct(m.answer.confidence)}</Pill>
                                </div>
                                <RichAnswer className="max-w-3xl" text={m.answer.answer} />
                                <details className="text-xs text-muted-foreground">
                                    <summary className="cursor-pointer transition-colors hover:text-foreground">
                                        Figures used
                                    </summary>
                                    <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-3">
                                        {JSON.stringify(m.answer.evidence, null, 2)}
                                    </pre>
                                </details>
                            </div>
                        </div>
                    </section>
                ))}
            </div>
            {ask.isPending && ask.variables && (
                <section
                    className="animate-in fade-in-0 space-y-3 border-b pb-6"
                    aria-live="polite"
                >
                    <p className="font-medium">{ask.variables}</p>
                    <div className="flex gap-3">
                        <Sparkles className="mt-1 size-5 shrink-0 animate-pulse text-primary" />
                        <div className="w-full max-w-xl space-y-2">
                            <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-9/12 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-10/12 animate-pulse rounded bg-muted" />
                        </div>
                    </div>
                </section>
            )}
            <ErrorLine error={ask.error} />
            <form
                className="flex gap-2 border-t pt-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    send(q);
                }}
            >
                <Input
                    aria-label="Ask a question"
                    placeholder="Ask about open invoices, unmatched payments, counterparties…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <Button
                    type="submit"
                    size="icon"
                    aria-label="Send question"
                    disabled={!q.trim() || ask.isPending}
                >
                    {ask.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                </Button>
            </form>
        </Page>
    );
}
