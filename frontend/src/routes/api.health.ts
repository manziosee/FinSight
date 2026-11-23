import { createFileRoute } from "@tanstack/react-router";
import { health } from "@/server/finsight.server";

export const Route = createFileRoute("/api/health")({
    server: { handlers: { GET: () => health() } },
});
