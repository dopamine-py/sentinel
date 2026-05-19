// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// SENTINEL_API_URL is the FastAPI signal-intelligence backend.
// Defaults to localhost:8000 (uvicorn src.api:app default).
const SENTINEL_API_URL = process.env.SENTINEL_API_URL || "http://127.0.0.1:8000";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      proxy: {
        // Proxy the CIRO/signal-intelligence endpoints from the dev server.
        // /api/sentinel/* → http://localhost:8000/api/*
        "/api/sentinel": {
          target: SENTINEL_API_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/sentinel/, "/api"),
          // When the backend is offline, the proxy fails — the client handles fallback.
          configure: (proxy) => {
            proxy.on("error", () => {
              // swallow — the API client retries / falls back to mock data
            });
          },
        },
      },
    },
  },
});
