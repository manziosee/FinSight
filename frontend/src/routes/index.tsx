import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, ArrowRight, Check, GitMerge, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeader, PublicFooter } from "@/components/finsight/public-shell";
import { productFeatures, faqs } from "@/components/finsight/public-content";
import { StatusBadge } from "@/components/finsight/status";
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from "@/components/ui/accordion";
import { useSession } from "@/components/finsight/session";
import office from "@/assets/finsight-office.jpg";
export const Route = createFileRoute("/")({
    head: () => ({
        meta: [
            { title: "FinSight — Financial clarity for your team" },
            {
                name: "description",
                content:
                    "Explore FinSight's financial workspace: transaction imports, reconciliation reviews, counterparties, cash scenarios and reports.",
            },
            { property: "og:title", content: "FinSight — Financial clarity for your team" },
            {
                property: "og:description",
                content:
                    "Bring payments, invoices and cash into one clear view. Explore the FinSight product preview.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary_large_image" },
        ],
    }),
    component: Landing,
});
function Landing() {
    const { money } = useSession();
    return (
        <div className="bg-background text-foreground">
            <PublicHeader />
            <main>
                <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
                    <img
                        src={office}
                        alt="A contemporary Kigali office with a financial spreadsheet on a laptop"
                        width={1536}
                        height={1024}
                        fetchPriority="high"
                        className="absolute inset-0 -z-20 h-full w-full object-cover object-right"
                    />
                    <div className="absolute inset-0 -z-10 bg-ink/55" />
                    <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
                        <p className="flex items-center gap-2 text-xs uppercase tracking-widest">
                            <span className="size-1.5 rounded-full bg-primary-glow" />
                            Financial clarity, together
                        </p>
                        <h1 className="mt-6 text-6xl font-semibold sm:text-7xl">FinSight</h1>
                        <p className="mt-5 max-w-xl text-2xl leading-snug sm:text-3xl">
                            Every payment has a story.
                            <br />
                            See the full picture.
                        </p>
                        <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-foreground/85">
                            Bring transactions, invoice reviews and cash scenarios into one
                            workspace — with the evidence always close by.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Button asChild size="lg">
                                <Link to="/app">
                                    Explore FinSight
                                    <ArrowUpRight />
                                </Link>
                            </Button>
                            <Button asChild variant="outline" size="lg" className="text-foreground">
                                <Link to="/how-it-works">
                                    How it works
                                    <ArrowRight />
                                </Link>
                            </Button>
                        </div>
                        <p className="mt-5 text-xs text-ink-foreground/75">
                            Sign in for your live workspace · or explore with sample data
                        </p>
                    </div>
                </section>
                <section className="border-b">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-7">
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                            One view across your records
                        </p>
                        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium">
                            <span>Bank statements</span>
                            <span>Mobile money</span>
                            <span>Invoices</span>
                            <span>Accounting exports</span>
                        </div>
                    </div>
                </section>
                <section className="mx-auto max-w-6xl px-6 py-20">
                    <div className="flex flex-wrap items-end justify-between gap-5">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-primary">
                                The workspace
                            </p>
                            <h2 className="mt-3 max-w-xl text-3xl font-semibold sm:text-4xl">
                                Less searching.
                                <br />
                                More understanding.
                            </h2>
                        </div>
                        <Button asChild variant="link">
                            <Link to="/features">
                                Explore all features
                                <ArrowUpRight />
                            </Link>
                        </Button>
                    </div>
                    <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                        {productFeatures.map((f) => (
                            <article key={f.title} className="border-t pt-5">
                                <f.Icon className="size-5 text-primary" />
                                <h3 className="mt-4 font-semibold">{f.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                    {f.text}
                                </p>
                                <Button asChild variant="link" className="mt-3 h-auto p-0">
                                    <Link to={f.to}>
                                        Explore
                                        <ArrowUpRight />
                                    </Link>
                                </Button>
                            </article>
                        ))}
                    </div>
                </section>
                <section className="border-y bg-muted/40">
                    <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-2">
                        <div>
                            <GitMerge className="size-6 text-primary" />
                            <h2 className="mt-5 text-3xl font-semibold">
                                A match is only as good
                                <br />
                                as its evidence.
                            </h2>
                            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                                Keep the payment, proposed invoice and source record in view. Review
                                the explanation before accepting a match.
                            </p>
                            <Button asChild className="mt-6">
                                <Link to="/app/reconciliation">
                                    Review a sample match
                                    <ArrowUpRight />
                                </Link>
                            </Button>
                        </div>
                        <div className="overflow-hidden rounded-lg border bg-card">
                            <div className="flex items-center justify-between border-b p-4 text-sm">
                                <span className="font-medium">October review · sample data</span>
                                <StatusBadge status="review" />
                            </div>
                            <div className="p-5">
                                <p className="text-xs text-muted-foreground">
                                    ABC Ltd · Bank of Kigali
                                </p>
                                <p className="num mt-2 text-2xl font-semibold">
                                    {money(2400000, "RWF")}
                                </p>
                                <div className="mt-5 space-y-3 border-t pt-4 text-sm">
                                    {[
                                        ["INV-2411", 1500000],
                                        ["INV-2418", 900000],
                                    ].map(([ref, amount]) => (
                                        <div key={ref} className="flex justify-between gap-3">
                                            <span>{ref}</span>
                                            <span className="num">
                                                {money(Number(amount), "RWF")}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-5 flex items-center gap-2 text-sm text-success">
                                    <Check className="size-4" />
                                    Two invoices sum to the payment
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
                <section className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2">
                    <div>
                        <ShieldCheck className="size-6 text-primary" />
                        <h2 className="mt-4 text-2xl font-semibold">
                            Clarity includes our limits.
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            Every screen says whether it shows your live data or sample data, and
                            features that aren\u2019t available yet are labelled as such.
                        </p>
                        <Button asChild variant="link" className="mt-4 p-0">
                            <Link to="/faq">
                                Data & preview details
                                <ArrowUpRight />
                            </Link>
                        </Button>
                    </div>
                    <div>
                        <Sparkles className="size-6 text-primary" />
                        <h2 className="mt-4 text-2xl font-semibold">
                            Questions, with source records.
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            Explore supported questions about transaction totals, counterparties and
                            sources. Every sample-data answer includes the records behind it.
                        </p>
                        <Button asChild variant="link" className="mt-4 p-0">
                            <Link to="/app/ask">
                                Ask FinSight
                                <ArrowUpRight />
                            </Link>
                        </Button>
                    </div>
                </section>
                <section className="border-t">
                    <div className="mx-auto max-w-3xl px-6 py-16">
                        <h2 className="text-3xl font-semibold">A few things worth knowing.</h2>
                        <Accordion type="single" collapsible className="mt-6">
                            {faqs.slice(0, 3).map((f, i) => (
                                <AccordionItem key={f.q} value={String(i)}>
                                    <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                                    <AccordionContent className="leading-relaxed text-muted-foreground">
                                        {f.a}
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                        <Button asChild variant="link" className="mt-5 p-0">
                            <Link to="/faq">
                                All questions
                                <ArrowUpRight />
                            </Link>
                        </Button>
                    </div>
                </section>
                <section className="bg-accent">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-14">
                        <div>
                            <h2 className="text-3xl font-semibold">Find your financial focus.</h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Start with the sample workspace. Follow the evidence.
                            </p>
                        </div>
                        <Button asChild size="lg">
                            <Link to="/app">
                                Explore FinSight
                                <ArrowUpRight />
                            </Link>
                        </Button>
                    </div>
                </section>
            </main>
            <PublicFooter />
        </div>
    );
}
