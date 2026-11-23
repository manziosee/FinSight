import { createFileRoute } from "@tanstack/react-router";
import { proxy } from "@/server/finsight.server";

const handler = ({ request, params }: { request: Request; params: { _splat?: string } }) =>
    proxy(request, params._splat ?? "");

export const Route = createFileRoute("/api/v1/$")({
    server: {
        handlers: { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler },
    },
});
