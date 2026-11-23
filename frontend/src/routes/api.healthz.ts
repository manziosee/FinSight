import { createFileRoute } from "@tanstack/react-router";

/** Liveness of the frontend server itself (container health checks). */
export const Route = createFileRoute("/api/healthz")({
    server: { handlers: { GET: () => Response.json({ ok: true }) } },
});
