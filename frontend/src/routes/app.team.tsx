import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Check,
    Copy,
    KeyRound,
    Loader2,
    MoreHorizontal,
    PauseCircle,
    PlayCircle,
    ShieldCheck,
    Trash2,
    UserPlus,
    Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorLine, Page, Pill, pageHead } from "@/components/finsight/page-kit";
import { AvatarCircle } from "@/components/finsight/user-menu";
import { useSession } from "@/components/finsight/session";
import { api, type Member, type MemberCredentials, type MemberRole } from "@/lib/api";
import { AVATARS, displayName, initialsOf } from "@/lib/avatars";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/team")({
    head: () => pageHead("Team", "Invite people to your FinSight workspace and set their access."),
    component: TeamPage,
});

const ROLES: { id: MemberRole; label: string; summary: string }[] = [
    {
        id: "admin",
        label: "Admin",
        summary: "Everything, including managing people, API keys and the audit log.",
    },
    {
        id: "analyst",
        label: "Analyst",
        summary: "Upload data, run and review reconciliations, forecasts and actions.",
    },
    {
        id: "viewer",
        label: "Viewer",
        summary: "Read-only: dashboards, reconciliation results, Ask FinSight and the audit log.",
    },
];

const roleLabel = (r: Member["role"]) => ROLES.find((x) => x.id === r)?.label ?? "Custom";
const ROLE_TONE: Record<Member["role"], "success" | "warning" | "neutral"> = {
    admin: "success",
    analyst: "warning",
    viewer: "neutral",
    custom: "neutral",
};
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,63}$/;

function avatarFor(id: string) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATARS[1 + (h % (AVATARS.length - 1))]!;
}

function TeamPage() {
    const { isLive, hasScope } = useSession();
    if (!isLive)
        return (
            <Gate
                title="Sign in to manage your team"
                body="Admins can add people, choose what each person can do, and remove access."
                action={
                    <Button asChild>
                        <Link to="/login">Sign in</Link>
                    </Button>
                }
            />
        );
    if (!hasScope("members:manage"))
        return (
            <Gate
                title="Only admins can manage the team"
                body="Ask an admin of your workspace to add people or change access."
            />
        );
    return <TeamManager />;
}

function Gate({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
    return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Users className="size-6" />
            </span>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{body}</p>
            {action}
        </div>
    );
}

function TeamManager() {
    const qc = useQueryClient();
    const members = useQuery({ queryKey: ["members"], queryFn: api.members.list });
    const [adding, setAdding] = useState(false);
    const [creds, setCreds] = useState<{ title: string; data: MemberCredentials } | null>(null);
    const [removing, setRemoving] = useState<Member | null>(null);
    const refresh = () => qc.invalidateQueries({ queryKey: ["members"] });

    const update = useMutation({
        mutationFn: (v: { id: string; role?: MemberRole; is_active?: boolean }) =>
            api.members.update(v.id, {
                ...(v.role ? { role: v.role } : {}),
                ...(v.is_active !== undefined ? { is_active: v.is_active } : {}),
            }),
        onSuccess: (m) => {
            toast.success(`${displayName(m.client_id)} updated`);
            void refresh();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
    });
    const reset = useMutation({
        mutationFn: (id: string) => api.members.resetSecret(id),
        onSuccess: (data) => setCreds({ title: "New sign-in secret", data }),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Reset failed"),
    });
    const remove = useMutation({
        mutationFn: (id: string) => api.members.remove(id),
        onSuccess: (_, id) => {
            toast.success(`${displayName(id)} removed`);
            setRemoving(null);
            void refresh();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Remove failed"),
    });

    const rows = members.data ?? [];
    const active = rows.filter((m) => m.is_active).length;

    return (
        <Page
            title="Team"
            subtitle="People who can sign in to this workspace and what they can do"
            actions={
                <Button onClick={() => setAdding(true)}>
                    <UserPlus />
                    Add person
                </Button>
            }
        >
            <div className="grid gap-3 sm:grid-cols-3">
                {ROLES.map((r) => (
                    <div key={r.id} className="lift rounded-lg border bg-card p-4">
                        <p className="flex items-center justify-between text-sm font-medium">
                            {r.label}
                            <span className="num text-lg">
                                {rows.filter((m) => m.role === r.id).length}
                            </span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{r.summary}</p>
                    </div>
                ))}
            </div>

            <ErrorLine error={members.error} />
            <div className="overflow-hidden rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
                    <span className="font-medium">Members</span>
                    <span className="text-muted-foreground">
                        {active} active · {rows.length} total
                    </span>
                </div>
                {members.isPending ? (
                    <div className="space-y-2 p-4">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
                        ))}
                    </div>
                ) : (
                    <ul className="divide-y">
                        {rows.map((m) => (
                            <li
                                key={m.client_id}
                                className={cn(
                                    "group flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
                                    !m.is_active && "opacity-60",
                                )}
                            >
                                <AvatarCircle
                                    option={avatarFor(m.client_id)}
                                    initials={initialsOf(displayName(m.client_id))}
                                    className="size-9"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-2 text-sm font-medium">
                                        {displayName(m.client_id)}
                                        {m.is_you && <Pill>You</Pill>}
                                        {!m.is_active && <Pill tone="danger">Suspended</Pill>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Signs in as <span className="font-mono">{m.client_id}</span>{" "}
                                        · added {new Date(m.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <Pill tone={ROLE_TONE[m.role]}>{roleLabel(m.role)}</Pill>
                                {m.is_you ? (
                                    <span className="w-8" />
                                ) : (
                                    <MemberMenu
                                        member={m}
                                        busy={update.isPending || reset.isPending}
                                        onRole={(role) => update.mutate({ id: m.client_id, role })}
                                        onToggle={() =>
                                            update.mutate({
                                                id: m.client_id,
                                                is_active: !m.is_active,
                                            })
                                        }
                                        onReset={() => reset.mutate(m.client_id)}
                                        onRemove={() => setRemoving(m)}
                                    />
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <AddPersonDialog
                open={adding}
                onOpenChange={setAdding}
                onAdded={(data) => {
                    setAdding(false);
                    setCreds({ title: `${displayName(data.member.client_id)} added`, data });
                    void refresh();
                }}
            />
            <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
            <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Remove {removing ? displayName(removing.client_id) : ""}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            They lose access to this workspace. Sessions they already have end
                            within 15 minutes. To pause access instead, choose Suspend.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-danger text-white hover:bg-danger/90"
                            disabled={remove.isPending}
                            onClick={(e) => {
                                e.preventDefault();
                                if (removing) remove.mutate(removing.client_id);
                            }}
                        >
                            {remove.isPending && <Loader2 className="animate-spin" />}
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Page>
    );
}

function MemberMenu({
    member,
    busy,
    onRole,
    onToggle,
    onReset,
    onRemove,
}: {
    member: Member;
    busy: boolean;
    onRole: (r: MemberRole) => void;
    onToggle: () => void;
    onReset: () => void;
    onRemove: () => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    aria-label={`Manage ${displayName(member.client_id)}`}
                >
                    <MoreHorizontal />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    Role
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={member.role}
                    onValueChange={(v) => onRole(v as MemberRole)}
                >
                    {ROLES.map((r) => (
                        <DropdownMenuRadioItem key={r.id} value={r.id}>
                            {r.label}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onReset}>
                    <KeyRound />
                    Reset sign-in secret
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onToggle}>
                    {member.is_active ? <PauseCircle /> : <PlayCircle />}
                    {member.is_active ? "Suspend access" : "Restore access"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onRemove} className="text-danger focus:text-danger">
                    <Trash2 />
                    Remove from workspace
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function AddPersonDialog({
    open,
    onOpenChange,
    onAdded,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onAdded: (c: MemberCredentials) => void;
}) {
    const [username, setUsername] = useState("");
    const [role, setRole] = useState<MemberRole>("analyst");
    const add = useMutation({
        mutationFn: () => api.members.add(username.trim(), role),
        onSuccess: (data) => {
            setUsername("");
            setRole("analyst");
            onAdded(data);
        },
    });
    const clean = username.trim();
    const valid = USERNAME.test(clean);
    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                onOpenChange(o);
                if (!o) add.reset();
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Add a person</DialogTitle>
                    <DialogDescription>
                        They'll sign in with this username and a secret FinSight generates.
                    </DialogDescription>
                </DialogHeader>
                <form
                    id="add-person"
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (valid && !add.isPending) add.mutate();
                    }}
                >
                    <label className="block text-sm">
                        Username
                        <Input
                            className="mt-1"
                            autoFocus
                            placeholder="e.g. alice or finance.team"
                            value={username}
                            maxLength={64}
                            onChange={(e) => setUsername(e.target.value.toLowerCase())}
                            aria-invalid={clean !== "" && !valid}
                        />
                        <span
                            className={cn(
                                "mt-1 block text-xs",
                                clean && !valid ? "text-danger" : "text-muted-foreground",
                            )}
                        >
                            3–64 characters: lowercase letters, numbers, dots, dashes or
                            underscores.
                        </span>
                    </label>
                    <fieldset className="space-y-2">
                        <legend className="mb-1 text-sm">Role</legend>
                        {ROLES.map((r) => (
                            <label
                                key={r.id}
                                className={cn(
                                    "flex cursor-pointer gap-3 rounded-lg border p-3 transition-all hover:border-primary/50",
                                    role === r.id &&
                                        "border-primary bg-primary/5 ring-1 ring-primary/30",
                                )}
                            >
                                <input
                                    type="radio"
                                    name="role"
                                    className="mt-1 accent-[var(--primary)]"
                                    checked={role === r.id}
                                    onChange={() => setRole(r.id)}
                                />
                                <span>
                                    <span className="block text-sm font-medium">{r.label}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {r.summary}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                    <ErrorLine error={add.error} />
                </form>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="add-person" disabled={!valid || add.isPending}>
                        {add.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
                        Add person
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CopyField({ label, value }: { label: string; value: string }) {
    const [done, setDone] = useState(false);
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <div className="mt-1 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <code className="min-w-0 flex-1 break-all font-mono text-sm">{value}</code>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label={`Copy ${label.toLowerCase()}`}
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(value);
                            setDone(true);
                            window.setTimeout(() => setDone(false), 1500);
                        } catch {
                            toast.error("Clipboard unavailable");
                        }
                    }}
                >
                    {done ? <Check className="text-success" /> : <Copy />}
                </Button>
            </div>
        </div>
    );
}

function CredentialsDialog({
    creds,
    onClose,
}: {
    creds: { title: string; data: MemberCredentials } | null;
    onClose: () => void;
}) {
    const signIn = typeof window === "undefined" ? "" : `${window.location.origin}/login`;
    const message = creds
        ? `You've been added to FinSight.\nSign in at ${signIn}\nUsername: ${creds.data.member.client_id}\nSecret: ${creds.data.client_secret}`
        : "";
    return (
        <Dialog open={!!creds} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{creds?.title}</DialogTitle>
                    <DialogDescription>
                        Share these sign-in details privately. The secret is shown only now; if it's
                        lost, reset it from the team list.
                    </DialogDescription>
                </DialogHeader>
                {creds && (
                    <div className="space-y-3">
                        <CopyField label="Sign-in page" value={signIn} />
                        <CopyField label="Username" value={creds.data.member.client_id} />
                        <CopyField label="Secret" value={creds.data.client_secret} />
                    </div>
                )}
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(message);
                                toast.success("Invitation copied");
                            } catch {
                                toast.error("Clipboard unavailable");
                            }
                        }}
                    >
                        <Copy />
                        Copy invitation
                    </Button>
                    <Button onClick={onClose}>Done</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
