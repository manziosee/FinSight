import { createFileRoute } from "@tanstack/react-router";
import { getSession, login, logout } from "@/server/finsight.server";

export const Route = createFileRoute("/api/session")({
    server: {
        handlers: {
            GET: ({ request }) => getSession(request),
            POST: ({ request }) => login(request),
            DELETE: ({ request }) => logout(request),
        },
    },
});
