import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
    server: { host: "::", port: 3500, strictPort: true },
    resolve: {
        dedupe: [
            "react",
            "react-dom",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "@tanstack/react-query",
            "@tanstack/query-core",
        ],
    },
    plugins: [
        tailwindcss(),
        tsconfigPaths({ projects: ["./tsconfig.json"] }),
        tanstackStart({
            // src/server.ts wraps TanStack Start's server entry (SSR error page, security headers).
            server: { entry: "server" },
            // Fail the build if browser code imports server-only modules (session/token handling).
            importProtection: {
                behavior: "error",
                client: { files: ["**/server/**"], specifiers: ["server-only"] },
            },
        }),
        // A plain Node server (`node .output/server/index.mjs`) for Docker, compose and Fly.
        nitro({ preset: "node-server" }),
        viteReact(),
    ],
});
