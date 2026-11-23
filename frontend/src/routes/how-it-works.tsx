import { createFileRoute, Link } from "@tanstack/react-router";
import { Upload, GitMerge, CheckCheck, ArrowUpRight } from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/finsight/public-shell";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/components/finsight/page-kit";
export const Route = createFileRoute("/how-it-works")({
    head: () =>
        pageHead(
            "How it works",
            "Follow records from CSV import through invoice reviews and exported reports in FinSight.",
        ),
    component: How,
});
function How() {
    const steps = [
        {
            Icon: Upload,
            title: "Start with the records",
            text: "Explore the provided sample transactions or import a fictional CSV. Each record retains its source file and row.",
        },
        {
            Icon: GitMerge,
            title: "Inspect the evidence",
            text: "Review sample invoice matches, amounts, references and confidence signals. Investigate discrepancies in the anomaly queue.",
        },
        {
            Icon: CheckCheck,
            title: "Review, report and reflect",
            text: "Try a sandbox approval, export a currency-separated report, and compare cash scenarios. Decisions are visible in the session activity log.",
        },
    ];
    return (
        <>
            <PublicHeader />
            <main className="mx-auto max-w-6xl px-6 py-16">
                <p className="text-sm text-primary">From records to understanding</p>
                <h1 className="mt-3 text-4xl font-semibold">How FinSight works</h1>
                <div className="mt-12 grid gap-10 md:grid-cols-3">
                    {steps.map((s, i) => (
                        <section key={s.title} className="border-t pt-6">
                            <div className="flex justify-between">
                                <s.Icon className="size-6 text-primary" />
                                <span className="num text-muted-foreground">0{i + 1}</span>
                            </div>
                            <h2 className="mt-6 text-xl font-medium">{s.title}</h2>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                {s.text}
                            </p>
                        </section>
                    ))}
                </div>
                <div className="mt-12 border-t pt-8">
                    <p className="mb-5 text-sm text-muted-foreground">
                        Signed in, every step runs on your live data: uploads are normalized
                        automatically and matched when you run a reconciliation.
                    </p>
                    <Button asChild>
                        <Link to="/app">
                            Explore FinSight
                            <ArrowUpRight />
                        </Link>
                    </Button>
                </div>
            </main>
            <PublicFooter />
        </>
    );
}
