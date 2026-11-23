import { createFileRoute } from "@tanstack/react-router";
import { PublicHeader, PublicFooter } from "@/components/finsight/public-shell";
import { faqs } from "@/components/finsight/public-content";
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from "@/components/ui/accordion";
import { pageHead } from "@/components/finsight/page-kit";
export const Route = createFileRoute("/faq")({
    head: () =>
        pageHead(
            "Frequently asked questions",
            "FinSight preview details: sample data, CSV uploads, privacy, currency support and service limitations.",
        ),
    component: FAQ,
});
function FAQ() {
    return (
        <>
            <PublicHeader />
            <main className="mx-auto max-w-3xl px-6 py-16">
                <p className="text-sm text-primary">Data, privacy & the product preview</p>
                <h1 className="mt-3 text-4xl font-semibold">Frequently asked questions</h1>
                <Accordion type="single" collapsible className="mt-10">
                    {faqs.map((f, i) => (
                        <AccordionItem value={String(i)} key={f.q}>
                            <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                {f.a}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
                <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
                    Use only fictional or redacted records in this preview. Formal service terms,
                    permanent storage and production security controls are not provided by this
                    sandbox.
                </p>
            </main>
            <PublicFooter />
        </>
    );
}
