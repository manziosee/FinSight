import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** View / edit / delete buttons for a table row; clicks don't open the row itself. */
export function RowActions({
    onView,
    onEdit,
    onDelete,
}: {
    onView?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}) {
    const items = [
        { label: "View", Icon: Eye, onClick: onView, tone: "" },
        { label: "Edit", Icon: Pencil, onClick: onEdit, tone: "" },
        { label: "Delete", Icon: Trash2, onClick: onDelete, tone: "hover:text-danger" },
    ].filter((i) => i.onClick);
    return (
        <div className="inline-flex gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
            {items.map(({ label, Icon, onClick, tone }) => (
                <Tooltip key={label}>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`size-7 ${tone}`}
                            aria-label={label}
                            onClick={(e) => {
                                e.stopPropagation();
                                onClick?.();
                            }}
                        >
                            <Icon />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                </Tooltip>
            ))}
        </div>
    );
}
