import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

// Production parity with the Vite dev proxy: forward /api/sentinel/* to the
// public signal-intelligence backend. Set SENTINEL_API_URL as a Worker var
// (wrangler.jsonc `vars` or the Cloudflare dashboard) to the deployed FastAPI
// base, e.g. https://sentinel-backend.onrender.com
// If unset/empty this returns 502 fast — the frontend then falls back to the
// bundled demo dataset gracefully (no hang, no crash).
async function proxyBackend(request: Request, base: string): Promise<Response> {
  const url = new URL(request.url);
  const target =
    base.replace(/\/$/, "") +
    url.pathname.replace(/^\/api\/sentinel/, "/api") +
    url.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.clone().arrayBuffer();
  }

  // Returning the upstream Response streams the body through unbuffered, so
  // the SSE reasoning stream (text/event-stream) works in prod too.
  return fetch(target, init);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/sentinel/")) {
        const base = (env as { SENTINEL_API_URL?: string } | undefined)
          ?.SENTINEL_API_URL;
        if (!base) {
          return new Response(
            JSON.stringify({ status: "error", message: "Backend not configured" }),
            { status: 502, headers: { "content-type": "application/json" } },
          );
        }
        try {
          return await proxyBackend(request, base);
        } catch {
          return new Response(
            JSON.stringify({ status: "error", message: "Backend unreachable" }),
            { status: 502, headers: { "content-type": "application/json" } },
          );
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
