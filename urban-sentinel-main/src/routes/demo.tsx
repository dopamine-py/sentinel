// /demo — thin wrapper around the single source-of-truth cinematic demo.
//
// The demo itself lives in the standalone `sentinel-demo-static` project and
// is built to one self-contained HTML string (src/demoHtml.ts, auto-generated
// by `npm run build:bundle` in that project). The SAME artifact is embedded
// by the mobile app's onboarding WebView, so there is exactly one demo to
// maintain — edit it in sentinel-demo-static, rebuild, both apps update.
//
// This route just renders it in a full-bleed <iframe> and overlays a real
// in-app "Go to console" control that navigates to /dashboard via the
// router (SPA navigation — no reload, no "restart").

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import demoHtml from "../demoHtml";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Sentinel — Demo" },
      { name: "description", content: "The Sentinel cinematic product demo." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  const navigate = useNavigate();

  // Backup exit path: the embedded demo can postMessage("skip").
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e?.data === "skip") navigate({ to: "/dashboard" });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [navigate]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0a0b0d]">
      <iframe
        title="Sentinel demo"
        srcDoc={demoHtml}
        className="absolute inset-0 h-full w-full border-0"
        // Sandbox: allow scripts (the demo is our own first-party build).
        sandbox="allow-scripts allow-same-origin"
      />

      {/* In-app exit — a DOM button above the iframe. On the web, z-index
          stacking works normally (unlike a native WebView), so this click
          always lands and routes within the SPA. */}
      <button
        type="button"
        onClick={() => navigate({ to: "/dashboard" })}
        className="absolute top-6 right-8 z-50 flex items-center gap-2 rounded-full px-4 py-2 bg-[#14161a]/70 border border-[#ffffff15] backdrop-blur-md text-[12.5px] font-medium text-[#9a9ea5] hover:text-[#e8e9eb] hover:bg-[#1a1c22]/90 transition-colors cursor-pointer"
      >
        Go to console <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
