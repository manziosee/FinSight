import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { endOfDay, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { PERIOD_PRESETS, formatPeriod } from "@/lib/period";
import { cn } from "@/lib/utils";

/** Header control for the workspace reporting period: presets plus a two-month range calendar. */
export function PeriodPicker({ className }: { className?: string }) {
    const { period, setPeriod } = useWorkspace();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<DateRange | undefined>({
        from: period.from,
        to: period.to,
    });

    return (
        <Popover
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (o) setDraft({ from: period.from, to: period.to });
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    aria-label="Reporting period"
                    className={cn("gap-2 font-normal", className)}
                >
                    <CalendarDays className="text-primary" />
                    <span className="num">{formatPeriod(period)}</span>
                    <ChevronDown className="text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
                <div className="flex flex-col sm:flex-row">
                    <div className="flex flex-row flex-wrap gap-1 border-b p-2 sm:w-36 sm:flex-col sm:border-b-0 sm:border-r">
                        {PERIOD_PRESETS.map((p) => (
                            <Button
                                key={p.id}
                                variant="ghost"
                                size="sm"
                                className="justify-start"
                                onClick={() => {
                                    setPeriod(p.range(new Date()));
                                    setOpen(false);
                                }}
                            >
                                {p.label}
                            </Button>
                        ))}
                    </div>
                    <div>
                        <Calendar
                            mode="range"
                            numberOfMonths={2}
                            defaultMonth={draft?.from ?? period.from}
                            selected={draft}
                            onSelect={setDraft}
                            disabled={{ after: new Date() }}
                        />
                        <div className="flex items-center justify-end gap-2 border-t p-2">
                            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                disabled={!draft?.from}
                                onClick={() => {
                                    if (!draft?.from) return;
                                    setPeriod({
                                        from: startOfDay(draft.from),
                                        to: endOfDay(draft.to ?? draft.from),
                                    });
                                    setOpen(false);
                                }}
                            >
                                Apply
                            </Button>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
