import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, LogIn, LogOut, Palette, Settings, Sparkles } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/components/finsight/session";
import { useWorkspace } from "@/components/finsight/workspace-context";
import { AVATARS, avatarById, initialsOf, type AvatarOption } from "@/lib/avatars";
import { cn } from "@/lib/utils";

export function AvatarCircle({
    option,
    initials,
    className,
}: {
    option: AvatarOption;
    initials: string;
    className?: string | undefined;
}) {
    return (
        <span
            aria-hidden
            className={cn(
                "grid size-8 shrink-0 select-none place-items-center rounded-full text-xs font-semibold",
                option.bg,
                className,
            )}
        >
            {option.glyph ? (
                <span className="text-[1.15em] leading-none">{option.glyph}</span>
            ) : (
                initials
            )}
        </span>
    );
}

/** The signed-in person's avatar, as chosen in the account menu. */
export function UserAvatar({ className }: { className?: string | undefined }) {
    const { user } = useSession();
    const { avatar } = useWorkspace();
    return (
        <AvatarCircle
            option={avatarById(avatar)}
            initials={initialsOf(user?.displayName ?? "Guest")}
            className={className}
        />
    );
}

export function AvatarPicker({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { user } = useSession();
    const { avatar, setAvatar } = useWorkspace();
    const initials = initialsOf(user?.displayName ?? "Guest");
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Choose your avatar</DialogTitle>
                    <DialogDescription>
                        Shown in the header and sidebar on this device.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                    {AVATARS.map((a) => {
                        const selected = a.id === avatarById(avatar).id;
                        return (
                            <button
                                key={a.id}
                                type="button"
                                title={a.label}
                                aria-label={a.label}
                                aria-pressed={selected}
                                onClick={() => {
                                    setAvatar(a.id);
                                    onOpenChange(false);
                                }}
                                className={cn(
                                    "relative grid place-items-center rounded-xl border p-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-md",
                                    selected && "border-primary ring-2 ring-primary/30",
                                )}
                            >
                                <AvatarCircle option={a} initials={initials} className="size-10" />
                                {selected && (
                                    <Check className="absolute right-1 top-1 size-3.5 text-primary" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Avatar button in the header: account summary, settings, avatar choice, sign out. */
export function UserMenu({
    onSignOut,
    onOpenBrief,
}: {
    onSignOut: () => void;
    onOpenBrief: () => void;
}) {
    const { user, isLive } = useSession();
    const [pickerOpen, setPickerOpen] = useState(false);
    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    aria-label="Account menu"
                    className="rounded-full outline-none ring-offset-2 ring-offset-background transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <UserAvatar />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
                        <UserAvatar className="size-10" />
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">
                                {user?.displayName ?? "Guest"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                                {user?.title ?? "Exploring sample data"}
                            </span>
                        </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onOpenBrief}>
                        <Sparkles />
                        Today's brief
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link to="/app/settings">
                            <Settings />
                            Settings
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
                        <Palette />
                        Choose avatar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {isLive ? (
                        <DropdownMenuItem
                            onSelect={onSignOut}
                            className="text-danger focus:text-danger"
                        >
                            <LogOut />
                            Sign out
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem asChild>
                            <Link to="/login">
                                <LogIn />
                                Sign in
                            </Link>
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            <AvatarPicker open={pickerOpen} onOpenChange={setPickerOpen} />
        </>
    );
}
