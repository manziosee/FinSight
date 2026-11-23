import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, ArrowRight, CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicHeader, PublicFooter } from "./public-shell";
import { useSession } from "./session";
import { ApiError } from "@/lib/api";

const benefits = [
    "Financial records in one place",
    "Source evidence at every step",
    "A consistent display currency",
];

/** Sign in with a FinSight API client (OAuth2 client credentials). The secret goes to this
 * app's server, which exchanges it with the gateway and keeps only an httpOnly session
 * cookie — the browser never stores a token. */
export function AccountForm({ register = false }: { register?: boolean }) {
    return (
        <>
            <PublicHeader />
            <main className="mx-auto grid max-w-5xl gap-12 px-6 py-12 md:grid-cols-2">
                <section className="py-6">
                    <p className="text-sm text-primary">FinSight workspace</p>
                    <h1 className="mt-4 text-4xl font-semibold">
                        {register ? "Get access to FinSight" : "Welcome back"}
                    </h1>
                    <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
                        {register
                            ? "Workspaces are opened for a tenant by a FinSight administrator, who issues an API client (ID and secret) with the right scopes. Self-service sign-up isn't available yet."
                            : "Sign in with your organisation's FinSight API client. Your secret is exchanged on our server for a short-lived session; it is never stored in the browser."}
                    </p>
                    <div className="mt-8 space-y-4 text-sm">
                        {benefits.map((t) => (
                            <p key={t} className="flex items-center gap-2">
                                <CheckCircle2 className="size-4 text-primary" />
                                {t}
                            </p>
                        ))}
                    </div>
                </section>
                {register ? <AccessCard /> : <LoginCard />}
            </main>
            <PublicFooter />
        </>
    );
}

function LoginCard() {
    const { login } = useSession();
    const navigate = useNavigate();
    const [clientId, setClientId] = useState("");
    const [secret, setSecret] = useState("");
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function submit() {
        setError("");
        setBusy(true);
        try {
            await login(clientId.trim(), secret);
            setSecret("");
            await navigate({ to: "/app" });
        } catch (e) {
            setError(
                e instanceof ApiError ? (e.detail ?? e.title) : "Sign-in failed. Please try again.",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            className="space-y-5 rounded-lg border bg-card p-6"
            onSubmit={(e) => {
                e.preventDefault();
                void submit();
            }}
        >
            <h2 className="flex items-center gap-2 text-xl font-semibold">
                <KeyRound className="size-5 text-primary" />
                Sign in
            </h2>
            <label className="block text-sm">
                Client ID
                <Input
                    required
                    className="mt-2"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    autoComplete="username"
                    placeholder="demo-client"
                />
            </label>
            <label className="block text-sm">
                Client secret
                <div className="relative mt-2">
                    <Input
                        required
                        type={show ? "text" : "password"}
                        className="pr-12"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        autoComplete="current-password"
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0"
                        aria-label={show ? "Hide secret" : "Show secret"}
                        onClick={() => setShow((s) => !s)}
                    >
                        {show ? <EyeOff /> : <Eye />}
                    </Button>
                </div>
            </label>
            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}
            <Button type="submit" className="w-full" disabled={busy || !clientId.trim() || !secret}>
                {busy ? "Signing in…" : "Sign in"}
                <ArrowRight />
            </Button>
            <p className="text-center text-sm text-muted-foreground">
                No credentials?{" "}
                <Link className="text-primary underline" to="/register">
                    Get access
                </Link>
            </p>
            <Button asChild variant="ghost" className="w-full">
                <Link to="/app">Explore with sample data</Link>
            </Button>
        </form>
    );
}

function AccessCard() {
    return (
        <section className="space-y-5 rounded-lg border bg-card p-6 text-sm">
            <h2 className="text-xl font-semibold">How access works</h2>
            <ol className="list-decimal space-y-3 pl-5 text-muted-foreground">
                <li>An administrator creates your tenant and an API client in identity-service.</li>
                <li>You receive a client ID and secret with the scopes your role needs.</li>
                <li>
                    Sign in here; developers can also mint scoped API keys from the Developers page.
                </li>
            </ol>
            <p className="text-xs text-muted-foreground">
                Running FinSight locally? The demo client is <code>demo-client</code> with the
                secret from your <code>.env</code>.
            </p>
            <Button asChild className="w-full">
                <Link to="/login">
                    I have credentials
                    <ArrowRight />
                </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
                <Link to="/app">Explore with sample data</Link>
            </Button>
        </section>
    );
}
