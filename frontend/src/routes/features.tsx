import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/finsight/public-shell";
import { productFeatures } from "@/components/finsight/public-content";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/components/finsight/page-kit";
export const Route = createFileRoute("/features")({
    head: () =>
        pageHead(
            "Features",
            "Explore FinSight transaction imports, reconciliation, counterparties, anomalies, forecasts and reports.",
        ),
    component: Features,
});
function Features() {
    return (
        <>
            <PublicHeader />
            <main className="mx-auto max-w-6xl px-6 py-16">
                <p className="text-sm text-primary">FinSight workspace</p>
                <h1 className="mt-3 text-4xl font-semibold">Your financial work, connected.</h1>
                <p className="mt-4 max-w-xl text-muted-foreground">
                    Everything below works on your live data when you sign in, and on sample data
                    when you just want to look around.
                </p>
                <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                    {productFeatures.map((f) => (
                        <article key={f.title} className="border-t py-6">
                            <f.Icon className="size-6 text-primary" />
                            <h2 className="mt-5 text-xl font-medium">{f.title}</h2>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                {f.text}
                            </p>
                            <Button asChild variant="link" className="mt-4 p-0">
                                <Link to={f.to}>
                                    Explore
                                    <ArrowUpRight />
                                </Link>
                            </Button>
                        </article>
                    ))}
                </div>
            </main>
            <PublicFooter />
        </>
    );
}
