import { createFileRoute } from "@tanstack/react-router";
import { openapi } from "@/server/finsight.server";

export const Route = createFileRoute("/api/openapi")({
    server: { handlers: { GET: () => openapi() } },
});
