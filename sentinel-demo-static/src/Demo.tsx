// Fullscreen self-playing 60-second cinematic timeline for Screen Studio recording.
// Open in fullscreen browser, start your recorder, hit Space (or click "Play"),
// and the page walks itself through six scenes in lockstep with the VO script.
//
// Timeline (ms):
//   0     - 7000   Opening: title cards
//   7000  - 17000  Ingestion: signals stream in, counter ticks 0→218
//   17000 - 29000  Orchestration: six-agent pipeline lights up
//   29000 - 41000  Map: incident pin, affected zone, red route, green reroute
//   41000 - 53000  Outcomes: action queue + confidence + before/after chart
//   53000 - 60000  Brand: SENTINEL wordmark + tagline + cities
//
// No backend dependency, no live polling — everything is timeline-driven.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Route as RouteIcon } from "lucide-react";
import {
  AGENTS,
  AGENT_ORDER,
  AgentNode,
  SentinelMark,
  SeverityChip,
  type AgentKey,
} from "./primitives";

export default Demo;

/* ============================================================
   TIMELINE
   ============================================================ */
const TL = {
  opening:       { start: 0,     end: 7000 },
  ingestion:     { start: 7000,  end: 17000 },
  orchestration: { start: 17000, end: 29000 },
  map:           { start: 29000, end: 41000 },
  outcomes:      { start: 41000, end: 53000 },
  brand:         { start: 53000, end: 60000 },
} as const;

const TOTAL_MS = 60000;

function progress(elapsed: number, start: number, end: number) {
  if (elapsed < start) return 0;
  if (elapsed > end) return 1;
  return (elapsed - start) / (end - start);
}

function isLive(elapsed: number, start: number, end: number) {
  return elapsed >= start && elapsed < end + 500; // small overlap for cross-fades
}

/* ============================================================
   ROOT
   ============================================================ */
type PlayState = "idle" | "playing" | "done";

function Demo() {
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const start = useCallback(() => {
    setElapsed(0);
    setPlayState("playing");
    startedAtRef.current = performance.now();
  }, []);

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setElapsed(0);
    setPlayState("idle");
  }, []);

  // Autoplay on mount (bundled-in-app onboarding use). Small delay so the
  // WebView has painted the first frame before the timeline starts.
  useEffect(() => {
    const id = setTimeout(() => start(), 600);
    return () => clearTimeout(id);
  }, [start]);

  // When the run finishes, hold on the final brand frame. We intentionally
  // do NOT auto-restart: looping made any moment the user tapped "Go to
  // console" look like the button "restarted the demo". The host
  // (OnboardingScreen) shows the primary CTA once the demo length elapses.

  // RAF loop while playing
  useEffect(() => {
    if (playState !== "playing") return;
    const tick = (now: number) => {
      const e = now - startedAtRef.current;
      if (e >= TOTAL_MS) {
        setElapsed(TOTAL_MS);
        setPlayState("done");
        return;
      }
      setElapsed(e);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playState]);

  // Keyboard: space to play/replay, escape to reset
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (playState === "idle") start();
        else if (playState === "done") {
          reset();
          // queue start after state settles
          setTimeout(() => start(), 30);
        }
      } else if (e.key === "Escape") {
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playState, start, reset]);

  const t = elapsed;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0a0b0d] text-[#e8e9eb]">
      {/* Always-on background grain */}
      <BackgroundCanvas elapsed={t} />

      {/* Scenes */}
      {playState !== "idle" && (
        <>
          {isLive(t, TL.opening.start, TL.opening.end) && <SceneOpening t={t - TL.opening.start} />}
          {isLive(t, TL.ingestion.start, TL.ingestion.end) && <SceneIngestion t={t - TL.ingestion.start} />}
          {isLive(t, TL.orchestration.start, TL.orchestration.end) && <SceneOrchestration t={t - TL.orchestration.start} />}
          {isLive(t, TL.map.start, TL.map.end) && <SceneMap t={t - TL.map.start} />}
          {isLive(t, TL.outcomes.start, TL.outcomes.end) && <SceneOutcomes t={t - TL.outcomes.start} />}
          {isLive(t, TL.brand.start, TL.brand.end) && <SceneBrand t={t - TL.brand.start} />}
        </>
      )}

      {/* The "Go to console" control lives in the native OnboardingScreen
          top bar (a real RN layout row above this WebView) — not in here.
          An in-WebView button can't reliably drive RN navigation and made
          the exit look like it "restarted the demo". Single native control
          is the reliable path. */}

      {/* Pre-roll: brand mark on a clean field until autoplay kicks in (~600ms) */}
      {playState === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <SentinelMark size="lg" />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   BACKGROUND — soft mesh + grain
   ============================================================ */
function BackgroundCanvas({ elapsed }: { elapsed: number }) {
  // Very subtle drift on the radial glow so the screen never feels static
  const phase = (elapsed % 60000) / 60000;
  const cx = 18 + Math.sin(phase * Math.PI * 2) * 4;
  const cy = 16 + Math.cos(phase * Math.PI * 2) * 3;
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 65% 50% at ${cx}% ${cy}%, rgba(103, 232, 249, 0.06), transparent 65%)`,
        }}
      />
      <div className="absolute inset-0 hero-grid opacity-50" />
    </div>
  );
}

/* ============================================================
   SCENE 1 — Opening
   "Karachi after a monsoon. Lahore at 46°."
   ============================================================ */
function SceneOpening({ t }: { t: number }) {
  // 0–1500 fade in title 1, 1500–3000 title 2, 3000–4500 title 3
  const line1 = t > 600 ? 1 : 0;
  const line2 = t > 2200 ? 1 : 0;
  const line3 = t > 3800 ? 1 : 0;
  const outFade = t > 6200 ? Math.max(0, 1 - (t - 6200) / 800) : 1;

  return (
    <SceneFrame fade={outFade}>
      <div className="absolute top-10 left-10 flex items-center gap-3">
        <SentinelMark size="sm" />
        <span className="label-eyebrow">Pakistan · live operations</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-12">
        <div className="text-center">
          <div
            className="font-display font-semibold leading-[0.95] tracking-[-0.04em]"
            style={{
              fontSize: "clamp(48px, 7.5vw, 120px)",
              opacity: line1,
              transform: `translateY(${line1 ? 0 : 12}px)`,
              transition: "opacity 700ms ease-out, transform 700ms ease-out",
            }}
          >
            Karachi after a monsoon.
          </div>
          <div
            className="mt-6 font-display font-semibold leading-[0.95] tracking-[-0.04em] text-[#9a9ea5]"
            style={{
              fontSize: "clamp(40px, 6vw, 96px)",
              opacity: line2,
              transform: `translateY(${line2 ? 0 : 12}px)`,
              transition: "opacity 700ms ease-out 100ms, transform 700ms ease-out 100ms",
            }}
          >
            Lahore at forty-six degrees.
          </div>
          <div
            className="mt-14 max-w-[28ch] mx-auto text-[#9a9ea5]"
            style={{
              fontSize: "clamp(15px, 1.3vw, 22px)",
              opacity: line3,
              transition: "opacity 700ms ease-out",
            }}
          >
            Millions of signals every day. Only a few are warnings.
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}

/* ============================================================
   SCENE 2 — Ingestion
   ============================================================ */
const INGEST_SIGNALS = [
  { src: "TWITTER",   color: "#818cf8", text: "Saddar mein paani bhar gaya, traffic completely jam.", geo: "24.86°N · 67.01°E" },
  { src: "WEATHER",   color: "#fbbf24", text: "Heat advisory: 46°C expected in Lahore by 14:00.",     geo: "31.55°N · 74.34°E" },
  { src: "TRAFFIC",   color: "#a78bfa", text: "Multi-vehicle collision on Shahrah-e-Faisal.",         geo: "24.86°N · 67.07°E" },
  { src: "CITIZEN",   color: "#fb7185", text: "Underpass at Nazimabad flooded knee-deep, avoid route.", geo: "24.91°N · 67.03°E" },
  { src: "K-ELECTRIC",color: "#f97316", text: "11kV feeder trip in DHA Phase 6, auto-reclose failed.", geo: "24.79°N · 67.04°E" },
  { src: "WEATHER",   color: "#67e8f9", text: "Monsoon cell intensifying over Karachi south.",        geo: "24.84°N · 67.02°E" },
  { src: "CITIZEN",   color: "#fb7185", text: "DHA Phase 6 mein bijli nahi, 4 ghantay ho gaye.",      geo: "24.79°N · 67.04°E" },
];

function SceneIngestion({ t }: { t: number }) {
  // Scene 2 reframed:
  //   0    – 2800   Operator console tableau, cursor moves to Run Mission, click
  //   2800 – 3000   Whip-cut flash into the ingestion view
  //   3000 – 9200   Counter ticks 0→218, signals stream
  //   9200 – 10000  Fade out
  const OP_END = 2800;
  const FLASH_END = 3000;

  const inFade = Math.min(1, t / 300);
  const outFade = t > 9200 ? Math.max(0, 1 - (t - 9200) / 800) : 1;

  if (t < OP_END) {
    return (
      <SceneFrame fade={Math.min(inFade, outFade)}>
        <OperatorTableau t={t} />
      </SceneFrame>
    );
  }

  // Ingestion phase — counter starts ticking AFTER the click
  const ingestT = t - FLASH_END;
  const dur = 6500;
  const p = Math.min(1, Math.max(0, ingestT / dur));
  // Snappy counter: very fast at first, settles late
  const eased = 1 - Math.pow(1 - p, 3);
  const count = Math.floor(eased * 218);

  const visibleSignals = INGEST_SIGNALS.filter((_, i) => ingestT > 250 + i * 700);

  // Brief flash on transition
  const flash = t >= OP_END && t < FLASH_END;

  return (
    <SceneFrame fade={Math.min(inFade, outFade)}>
      <FlashPunch active={flash} intensity={0.22} />
      <div className="absolute top-10 left-10 flex items-center gap-3">
        <SentinelMark size="sm" />
        <span className="label-eyebrow">Ingest · live</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-16">
          <div className="grid grid-cols-[1fr_460px] gap-12 w-full max-w-[1280px]">
            {/* Left side — counter */}
            <div>
              <div className="label-eyebrow">Signals ingested · last 4 seconds</div>
              <div
                className="mt-6 font-display font-semibold tracking-[-0.04em] tabular-nums"
                style={{
                  fontSize: "clamp(80px, 12vw, 200px)",
                  lineHeight: 0.95,
                  // Tiny jitter while counting fast
                  transform: ingestT < 1500 ? `translateX(${Math.sin(ingestT * 0.05) * 0.6}px)` : "none",
                }}
              >
                {count}
              </div>
              <div className="mt-4 flex items-center gap-3 text-[#9a9ea5]">
                <span className="dot-pulse dot-ok text-status-ok" />
                <span className="font-mono text-[12px]">streaming · karachi · lahore · multan</span>
              </div>

              <div className="mt-10 grid grid-cols-3 gap-3 max-w-[460px]">
                <Stat label="Sources" value="6" />
                <Stat label="Geocoded" value="91%" />
                <Stat label="Languages" value="3" />
              </div>
            </div>

            {/* Right side — incoming signal stack */}
            <div className="surface p-5">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#ffffff10]">
                <div className="flex items-center gap-2">
                  <span className="dot-pulse dot-ok text-status-ok" />
                  <span className="text-[12.5px] font-medium tracking-tight">Live signals</span>
                </div>
                <span className="label-eyebrow">streaming</span>
              </div>
              <ul className="space-y-2 max-h-[440px] overflow-hidden">
                {visibleSignals.map((s, i) => (
                  <li
                    key={i}
                    className="surface-input rounded-md p-3 animate-rise"
                    style={{ animationDelay: "0ms" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] tracking-[0.14em] uppercase" style={{ color: s.color }}>
                        {s.src}
                      </span>
                      <span className="font-mono text-[10px] text-text-tertiary">now</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug text-text-primary">{s.text}</p>
                    <p className="mt-1 font-mono text-[10px] text-text-tertiary">{s.geo}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
    </SceneFrame>
  );
}

/* Operator console tableau — Run mission button self-presses to kick off ingestion.
   2.8 seconds total:
     0    – 600   Tableau fades in
     600  – 1300  Button warm-up glow (anticipation)
     1300 – 1700  Button self-press + cyan flash ring
     1700 – 2200  Hold pressed
     2200 – 2800  Camera punches in slightly toward the button before the cut
*/
function OperatorTableau({ t }: { t: number }) {
  const fadeIn = Math.min(1, t / 500);
  const pressed = t >= 1300 && t < 1800;
  const buttonGlow = t >= 700;
  const flashRing = t >= 1300 && t < 1700;

  return (
    <>
      <div className="absolute top-10 left-10 flex items-center gap-3" style={{ opacity: fadeIn }}>
        <SentinelMark size="sm" />
        <span className="label-eyebrow">Console</span>
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center px-16"
        style={{ opacity: fadeIn, transition: "opacity 500ms ease-out" }}
      >
        <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-6 w-full max-w-[1100px]">
          {/* Left rail — scenario selector + Run mission */}
          <div className="surface p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[13px] font-medium tracking-tight">Run a mission</span>
              <span className="label-eyebrow">live</span>
            </div>

            <div className="label-eyebrow">Scenario</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <ScenarioChip emoji="🌊" label="Flood" city="Karachi" active />
              <ScenarioChip emoji="🔥" label="Heat" city="Multan" />
              <ScenarioChip emoji="🚗" label="MVC" city="Karachi" />
              <ScenarioChip emoji="🚧" label="Block" city="Lahore" />
            </div>

            <div className="mt-4 label-eyebrow">Custom signal</div>
            <div className="mt-2 surface-input rounded-md p-2.5 font-mono text-[11.5px] text-text-secondary">
              Saddar mein paani bhar gaya, traffic jam hai.<span className="ml-0.5 opacity-60 animate-pulse">▍</span>
            </div>

            {/* Run mission button — auto-presses at t≈1300ms */}
            <button
              type="button"
              tabIndex={-1}
              className="relative mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md py-2.5 text-[13px] font-medium"
              style={{
                background: buttonGlow ? "#fff" : "#e8e9eb",
                color: "#0a0b0d",
                boxShadow: pressed
                  ? "0 0 0 4px rgba(103,232,249,0.35), 0 0 30px rgba(103,232,249,0.45)"
                  : buttonGlow
                  ? "0 0 0 3px rgba(103,232,249,0.20)"
                  : "none",
                transform: pressed ? "translateY(1px)" : "translateY(0)",
                transition: "box-shadow 200ms ease-out, transform 120ms ease-out, background 180ms ease-out",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              Run mission
              {/* Self-press flash ring — replaces the cursor click ripple */}
              {flashRing && (
                <span
                  className="absolute inset-[-6px] rounded-md pointer-events-none"
                  style={{
                    border: "2px solid rgba(103, 232, 249, 0.85)",
                    animation: "demoPressRing 480ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
                  }}
                />
              )}
            </button>
            <style>{`
              @keyframes demoPressRing {
                from { transform: scale(0.92); opacity: 1; }
                to   { transform: scale(1.18); opacity: 0; }
              }
            `}</style>

            <div className="mt-3 text-[10.5px] font-mono text-text-tertiary text-center">
              {pressed ? <span className="text-accent-cyan">▍ executing…</span> : "⌘ + return"}
            </div>
          </div>

          {/* Right side — preview placeholder */}
          <div className="surface p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium tracking-tight">Mission preview</span>
              <span className="label-eyebrow text-accent-cyan">awaiting trigger</span>
            </div>
            <div className="flex-1 surface-input rounded-md flex items-center justify-center">
              <div className="text-center">
                <div className="label-eyebrow">Sentinel mesh</div>
                <div className="mt-2 text-[14px] font-medium text-text-secondary">6 agents · standing by</div>
                <div className="mt-3 flex items-center justify-center gap-1.5">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-status-ok"
                      style={{
                        opacity: 0.4 + 0.6 * Math.abs(Math.sin((t + i * 200) * 0.004)),
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ScenarioChip({
  emoji,
  label,
  city,
  active,
}: {
  emoji: string;
  label: string;
  city: string;
  active?: boolean;
}) {
  return (
    <div
      className="rounded-md p-2 border text-left text-[11.5px]"
      style={{
        borderColor: active ? "rgba(103,232,249,0.40)" : "rgba(255,255,255,0.06)",
        background: active ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.02)",
      }}
    >
      <div className="text-base leading-none">{emoji}</div>
      <div className="mt-1 font-medium text-text-primary leading-tight">{label}</div>
      <div className="mt-0.5 text-text-tertiary">{city}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-input rounded-md p-3">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-1 font-display text-[26px] font-semibold tracking-tight">{value}</div>
    </div>
  );
}

/* ============================================================
   SCENE 3 — Orchestration
   ============================================================ */
const AGENT_CARDS: Record<AgentKey, string[]> = {
  scout:        ["218 signals", "91% geocoded"],
  verification: ["Trust 0.91", "12 suppressed"],
  decision:     ["Flood · p=0.92", "CRITICAL"],
  execution:    ["5 actions", "dispatched"],
  monitoring:   ["P50 outcome", "managed at T+92m"],
  adaptation:   ["Plan v2", "broadcast"],
};

function SceneOrchestration({ t }: { t: number }) {
  // 12s scene, 6 agents → ~1.85s each. Start at ~0.4s so the pipeline reads first.
  const step = Math.min(5, Math.floor((t - 400) / 1850));
  const activeIndex = Math.max(0, step);

  const outFade = t > 11200 ? Math.max(0, 1 - (t - 11200) / 800) : 1;
  const inFade = Math.min(1, t / 400);

  // Camera tracks the active agent — slight zoom + horizontal pan.
  // Agent positions on the pipeline (roughly): 16, 30, 44, 58, 72, 86 (xPct)
  // CRITICAL flash when the Decision agent activates (step 2 = index 2)
  const decisionFlash = t > 400 + 1850 * 2 - 80 && t < 400 + 1850 * 2 + 200;

  return (
    <SceneFrame fade={Math.min(inFade, outFade)}>
      <FlashPunch active={decisionFlash} intensity={0.16} />

      <div className="absolute top-10 left-10 flex items-center gap-3">
        <SentinelMark size="sm" />
        <span className="label-eyebrow">Orchestration</span>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-12">
        <div
          className="text-center mb-12"
          style={{ opacity: Math.min(1, t / 600), transition: "opacity 600ms ease-out" }}
        >
          <div className="label-eyebrow">Six autonomous agents</div>
          <h2
            className="mt-3 font-display font-semibold tracking-[-0.03em]"
            style={{ fontSize: "clamp(36px, 4.5vw, 68px)", lineHeight: 1.05 }}
          >
            Observe. Verify. Decide.
            <br />
            <span className="text-[#9a9ea5]">Execute. Monitor. Adapt.</span>
          </h2>
        </div>

        <PipelineLarge activeIndex={activeIndex} t={t} />
      </div>
    </SceneFrame>
  );
}

function PipelineLarge({ activeIndex, t }: { activeIndex: number; t: number }) {
  return (
    <div className="relative w-full max-w-[1280px] px-6 py-10">
      {/* Connecting line behind nodes */}
      <svg
        className="absolute inset-x-6 top-1/2 -translate-y-1/2 pointer-events-none"
        height="6"
        width="calc(100% - 48px)"
        viewBox="0 0 600 6"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="demoFlow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(103,232,249,0)" />
            <stop offset="50%" stopColor="rgba(103,232,249,0.7)" />
            <stop offset="100%" stopColor="rgba(103,232,249,0)" />
          </linearGradient>
        </defs>
        {AGENT_ORDER.slice(0, -1).map((_, i) => {
          const x1 = 60 + i * 96;
          const x2 = 60 + (i + 1) * 96;
          const live = i < activeIndex;
          return (
            <g key={i}>
              <line x1={x1} y1={3} x2={x2} y2={3} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              {live && (
                <line
                  x1={x1}
                  y1={3}
                  x2={x2}
                  y2={3}
                  stroke="url(#demoFlow)"
                  strokeWidth={1.6}
                  strokeDasharray="4 6"
                  className="data-line"
                />
              )}
            </g>
          );
        })}
      </svg>

      <div className="relative grid grid-cols-6 gap-4">
        {AGENT_ORDER.map((k, i) => {
          const state: "idle" | "running" | "done" =
            i < activeIndex ? "done" : i === activeIndex ? "running" : "idle";
          const showCard = i === activeIndex && t > 400;
          const card = AGENT_CARDS[k];
          return (
            <div key={k} className="flex flex-col items-center">
              <div className="relative">
                {/* Pop-up card */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 -top-20 w-[160px] surface-input rounded-md px-3 py-2 text-center"
                  style={{
                    opacity: showCard ? 1 : 0,
                    transform: `translate(-50%, ${showCard ? 0 : 8}px)`,
                    transition: "opacity 280ms ease-out, transform 280ms ease-out",
                    pointerEvents: "none",
                  }}
                >
                  <div className="label-eyebrow text-accent-cyan">{card[0]}</div>
                  <div className="mt-1 text-[12px] font-medium text-text-primary leading-tight">{card[1]}</div>
                </div>

                {/* Agent node, larger */}
                <div className="scale-[1.4] origin-top">
                  <AgentNode agent={AGENTS[k]} state={state} size="md" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   SCENE 4 — Map + reroute
   ============================================================ */
function SceneMap({ t }: { t: number }) {
  // Beats inside 12s scene:
  //   0.0s  cursor enters from off-screen
  //   0.6s  cursor reaches incident pin → CLICK → red ripple, circle expands
  //   2.4s  cursor pans along primary route → red dashed route draws
  //   4.4s  cursor swings up to alternate path → green solid route draws
  //   6.4s  cursor lands on reroute row in side panel → hover highlight
  //   8.2s  saved-time badge fades in
  const pinIn = t > 200 ? 1 : 0;
  const ringP = Math.min(1, Math.max(0, (t - 600) / 1200));
  const primaryP = Math.min(1, Math.max(0, (t - 2400) / 1500));
  const altP = Math.min(1, Math.max(0, (t - 4400) / 1500));
  const panelP = Math.min(1, Math.max(0, (t - 6400) / 700));
  const savedP = Math.min(1, Math.max(0, (t - 8200) / 700));
  const rerouteHighlight = t > 7000 && t < 11000;

  const outFade = t > 11200 ? Math.max(0, 1 - (t - 11200) / 800) : 1;
  const inFade = Math.min(1, t / 400);

  // FLASH at incident pin pulse (around t=600)
  const flash = t > 580 && t < 720;

  return (
    <SceneFrame fade={Math.min(inFade, outFade)}>
      <FlashPunch active={flash} intensity={0.18} />

      <div className="absolute top-10 left-10 flex items-center gap-3">
        <SentinelMark size="sm" />
        <span className="label-eyebrow">Map · reroute</span>
      </div>

      <FitStage>
        <div className="flex flex-col gap-6">
          {/* Caption — now in normal flow so it never overlaps the map */}
          <div
            className="text-center"
            style={{ opacity: panelP, transition: "opacity 500ms ease-out" }}
          >
            <div className="label-eyebrow">When Shahrah-e-Faisal floods</div>
            <h2
              className="mt-2 font-display font-semibold tracking-[-0.03em]"
              style={{ fontSize: "clamp(24px, 3.5vw, 48px)", lineHeight: 1.05 }}
            >
              Citizens see a safer route. <span className="text-[#9a9ea5]">Instantly.</span>
            </h2>
          </div>

          <div className="grid grid-cols-[1fr_380px] gap-10 w-full max-w-[1380px] items-center mx-auto">
            {/* Map */}
            <StylizedMap
              pinIn={pinIn}
              ringP={ringP}
              primaryP={primaryP}
              altP={altP}
            />

            {/* Side panel */}
            <div
              className="surface p-5"
              style={{
                opacity: panelP,
                transform: `translateX(${(1 - panelP) * 24}px)`,
                transition: "none",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <RouteIcon className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} />
                <span className="text-[13px] font-medium tracking-tight">Suggested reroute</span>
              </div>
              <div className="text-[11.5px] text-text-tertiary mb-4">Saddar, Karachi · live</div>

              <RouteRow
                label="Affected route"
                color="#ef4444"
                dur="18 min"
                dist="7.2 km"
                dashed
              />
              <div
                style={{
                  outline: rerouteHighlight ? "1px solid rgba(103,232,249,0.45)" : "none",
                  outlineOffset: "2px",
                  borderRadius: 8,
                  transition: "outline 220ms ease-out",
                }}
              >
                <RouteRow
                  label="Reroute"
                  color="#34d399"
                  dur="21 min"
                  dist="8.4 km"
                  recommended
                />
              </div>

              <div
                className="mt-5 pt-4 border-t border-[#ffffff10] flex items-center gap-2"
                style={{ opacity: savedP, transition: "opacity 500ms ease-out" }}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-status-ok" strokeWidth={1.75} />
                <span className="font-mono text-[11.5px] text-status-ok">Avoids the flood zone</span>
              </div>

              <div
                className="mt-2 text-[11.5px] text-text-tertiary"
                style={{ opacity: savedP, transition: "opacity 500ms ease-out" }}
              >
                Plus 3 minutes — keeps you out of waist-deep water.
              </div>
            </div>
          </div>
        </div>
      </FitStage>
    </SceneFrame>
  );
}

function StylizedMap({
  pinIn,
  ringP,
  primaryP,
  altP,
}: {
  pinIn: number;
  ringP: number;
  primaryP: number;
  altP: number;
}) {
  const W = 760;
  const H = 480;
  // Center the incident roughly mid-map
  const cx = 380;
  const cy = 240;
  const radius = 70;

  // Primary route: passes THROUGH the affected zone
  const primaryPath = `M 60 ${cy + 30}
                       C 180 ${cy + 60}, 280 ${cy + 30}, ${cx} ${cy}
                       C ${cx + 100} ${cy - 30}, 580 ${cy - 60}, 700 ${cy - 20}`;
  // Alternate: curves north around it
  const altPath = `M 60 ${cy + 30}
                   C 180 ${cy + 10}, 240 ${cy - 80}, 320 ${cy - 130}
                   C 400 ${cy - 170}, 520 ${cy - 140}, 620 ${cy - 90}
                   C 670 ${cy - 60}, 690 ${cy - 30}, 700 ${cy - 20}`;

  return (
    <div className="relative rounded-xl overflow-hidden border border-[#ffffff10] bg-[#0e1014] aspect-[19/12]">
      {/* Soft gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(103,232,249,0.06), transparent 70%)",
        }}
      />
      {/* Street grid */}
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full">
        <defs>
          <pattern id="streetGrid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.8" />
          </pattern>
          <pattern id="streetGrid2" width="120" height="120" patternUnits="userSpaceOnUse">
            <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#streetGrid)" />
        <rect width="100%" height="100%" fill="url(#streetGrid2)" />

        {/* A few abstract "major roads" */}
        <path d="M 0 180 L 760 200" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <path d="M 0 300 L 760 320" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <path d="M 250 0 L 270 480" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <path d="M 510 0 L 530 480" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
        <path d="M 130 60 L 660 420" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

        {/* Affected zone */}
        <circle
          cx={cx}
          cy={cy}
          r={radius * ringP}
          fill="rgba(239, 68, 68, 0.13)"
          stroke="rgba(239, 68, 68, 0.55)"
          strokeWidth="1.5"
          strokeDasharray="6 6"
          style={{ transition: "none" }}
        />
        {/* Inner affected circle for visual depth */}
        <circle
          cx={cx}
          cy={cy}
          r={(radius - 20) * ringP}
          fill="rgba(239, 68, 68, 0.08)"
        />

        {/* Primary (affected) route — dashed red */}
        <path
          d={primaryPath}
          fill="none"
          stroke="#ef4444"
          strokeOpacity={0.9}
          strokeWidth="4"
          strokeDasharray="10 6"
          pathLength="100"
          strokeDashoffset={`${100 - primaryP * 100}`}
          style={{ transition: "none" }}
        />

        {/* Alternate route — solid green */}
        <path
          d={altPath}
          fill="none"
          stroke="#34d399"
          strokeOpacity={0.95}
          strokeWidth="4"
          pathLength="100"
          strokeDasharray="100 100"
          strokeDashoffset={`${100 - altP * 100}`}
          style={{ transition: "none" }}
        />

        {/* Start + end markers along the route */}
        <circle cx={60} cy={cy + 30} r="6" fill="#67e8f9" stroke="#0a0b0d" strokeWidth="2" />
        <circle cx={700} cy={cy - 20} r="6" fill="#34d399" stroke="#0a0b0d" strokeWidth="2" />

        {/* Incident pin */}
        <g
          style={{
            opacity: pinIn,
            transform: `translateY(${pinIn ? 0 : 6}px)`,
            transition: "opacity 400ms ease-out, transform 400ms ease-out",
            transformOrigin: `${cx}px ${cy}px`,
          }}
        >
          <circle cx={cx} cy={cy} r="14" fill="#ef4444" stroke="#fff" strokeWidth="2" />
          <circle cx={cx} cy={cy} r="4" fill="#fff" />
        </g>
      </svg>

      {/* Floating label */}
      <div
        className="absolute"
        style={{
          left: `${(cx / W) * 100}%`,
          top: `${(cy / H) * 100}%`,
          transform: "translate(20px, -50%)",
          opacity: ringP,
          transition: "opacity 600ms ease-out",
        }}
      >
        <div className="rounded-md bg-[#0e1014]/90 border border-[#ef444444] px-2.5 py-1.5 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-[#ef4444]" strokeWidth={2} />
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#fda4af]">
              Affected zone
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-text-secondary">Saddar · 1.5 km</div>
        </div>
      </div>

      {/* HUD corner labels */}
      <div className="absolute top-3 left-3 label-eyebrow text-[#3a3d44]">KHI · Saddar</div>
      <div className="absolute bottom-3 right-3 font-mono text-[10px] text-[#3a3d44]">24.86°N · 67.01°E</div>
    </div>
  );
}

function RouteRow({
  label,
  color,
  dur,
  dist,
  dashed,
  recommended,
}: {
  label: string;
  color: string;
  dur: string;
  dist: string;
  dashed?: boolean;
  recommended?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 mb-2 ${
        recommended ? "border" : "surface-input"
      }`}
      style={
        recommended
          ? { backgroundColor: "rgba(52, 211, 153, 0.06)", borderColor: "rgba(52, 211, 153, 0.30)" }
          : undefined
      }
    >
      <span
        className="shrink-0"
        style={{
          width: 24,
          height: 4,
          borderRadius: 2,
          background: dashed ? "transparent" : color,
          border: dashed ? `1.5px dashed ${color}` : "none",
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium">{label}</div>
      </div>
      <div className="font-mono text-[11.5px] text-text-secondary tabular-nums">{dur}</div>
      <div className="font-mono text-[11px] text-text-tertiary tabular-nums w-[52px] text-right">{dist}</div>
      {recommended && <span className="pill pill-ok">PICK</span>}
    </div>
  );
}

/* ============================================================
   SCENE 5 — Outcomes
   ============================================================ */
const ACTIONS = [
  { p: 1, action: "Deploy 6 dewatering pumps to II Chundrigar", assignee: "KMC Drainage", status: "DISPATCHED" },
  { p: 2, action: "Reroute traffic via Sharae Quaideen",         assignee: "Traffic Police", status: "ACK" },
  { p: 3, action: "Urdu / English cell broadcast to affected",   assignee: "PTA",            status: "COMPLETE" },
  { p: 4, action: "Pre-position 4 ambulances at Civil + JPMC",   assignee: "Rescue 1122",    status: "DISPATCHED" },
  { p: 5, action: "Open emergency shelter at Frere Hall",        assignee: "Civil Defence",  status: "QUEUED" },
] as const;

function SceneOutcomes({ t }: { t: number }) {
  // Beats inside 12s scene:
  //   0.4s headline
  //   1.0s confidence bar starts rising (3.5s) — camera on LEFT panel
  //   3.5s camera pans to CENTER panel (action queue)
  //   7.5s camera pans to RIGHT panel (before/after chart)
  //   8.0s before/after chart animates
  //   9.5s outcome label, camera pulls back
  const head = Math.min(1, Math.max(0, (t - 200) / 500));
  const confidenceP = Math.min(1, Math.max(0, (t - 900) / 3500));
  const visibleActions = ACTIONS.filter((_, i) => t > 900 + i * 1100);
  const beforeAfterP = Math.min(1, Math.max(0, (t - 7800) / 1400));
  const outcomeP = Math.min(1, Math.max(0, (t - 9400) / 700));

  const outFade = t > 11200 ? Math.max(0, 1 - (t - 11200) / 800) : 1;
  const inFade = Math.min(1, t / 400);

  // Punch flash when CRISIS_MANAGED label lands
  const managedFlash = t > 9400 && t < 9700;

  return (
    <SceneFrame fade={Math.min(inFade, outFade)}>
      <FlashPunch active={managedFlash} intensity={0.14} />

      <div className="absolute top-10 left-10 flex items-center gap-3">
        <SentinelMark size="sm" />
        <span className="label-eyebrow">Outcomes</span>
      </div>

      <FitStage>
        <div
          className="text-center mb-8"
          style={{ opacity: head, transition: "opacity 500ms ease-out" }}
        >
          <div className="label-eyebrow">Plans are real</div>
          <h2
            className="mt-3 font-display font-semibold tracking-[-0.03em]"
            style={{ fontSize: "clamp(24px, 4vw, 56px)", lineHeight: 1.05 }}
          >
            Every dispatch is traced. <span className="text-[#9a9ea5]">Every outcome is simulated.</span>
          </h2>
        </div>

        <div className="grid grid-cols-[280px_minmax(0,1fr)_280px] gap-6 w-full max-w-[1280px] mx-auto">
          {/* LEFT — Confidence */}
          <div className="surface p-5 flex flex-col justify-center">
            <div className="label-eyebrow">Detection confidence</div>
            <div
              className="mt-2 font-display font-semibold tabular-nums"
              style={{ fontSize: "clamp(40px, 5vw, 64px)", lineHeight: 1 }}
            >
              {Math.round(confidenceP * 92)}<span className="text-[#6b6f76] text-[60%]">%</span>
            </div>
            <div className="mt-4 confidence-track">
              <div className="confidence-fill" style={{ width: `${confidenceP * 100}%`, transition: "none" }} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <SeverityChip severity="CRITICAL" />
              <span className="font-mono text-[10.5px] text-text-tertiary">cross-source · 218 signals</span>
            </div>
          </div>

          {/* CENTER — Action queue */}
          <div className="surface p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12.5px] font-medium tracking-tight">Action queue</span>
              <span className="label-eyebrow">{visibleActions.length} of 5</span>
            </div>
            <ul className="space-y-2">
              {ACTIONS.map((a, i) => {
                const isVisible = visibleActions.find((v) => v.p === a.p);
                return (
                  <li
                    key={a.p}
                    style={{
                      opacity: isVisible ? 1 : 0,
                      transform: `translateY(${isVisible ? 0 : 6}px)`,
                      transition: "opacity 500ms ease-out, transform 500ms ease-out",
                    }}
                  >
                    <ActionLine a={a} />
                  </li>
                );
              })}
            </ul>
          </div>

          {/* RIGHT — Before/After */}
          <div className="surface p-5 flex flex-col">
            <div className="label-eyebrow">Congestion · before / after</div>
            <BeforeAfterChart p={beforeAfterP} />
            <div
              className="mt-3 text-center"
              style={{ opacity: outcomeP, transition: "opacity 500ms ease-out" }}
            >
              <span className="pill pill-ok">CRISIS_MANAGED at T+92m</span>
            </div>
          </div>
        </div>
      </FitStage>
    </SceneFrame>
  );
}

function ActionLine({ a }: { a: (typeof ACTIONS)[number] }) {
  const status = a.status;
  const pill =
    status === "COMPLETE"
      ? "pill-ok"
      : status === "ACK"
      ? "pill-low"
      : status === "DISPATCHED"
      ? "pill-high"
      : "pill-medium";
  return (
    <div className="surface-input rounded-md px-3 py-2 flex items-center gap-3">
      <span className="h-6 w-6 rounded-sm border border-[#ffffff14] bg-[#ffffff05] text-[11px] font-mono text-text-secondary grid place-items-center tabular-nums">
        {a.p}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium leading-tight truncate">{a.action}</div>
        <div className="mt-0.5 font-mono text-[10px] text-text-tertiary truncate">→ {a.assignee}</div>
      </div>
      <span className={`pill ${pill}`}>{status}</span>
    </div>
  );
}

function BeforeAfterChart({ p }: { p: number }) {
  // Animate bars from full red → half red, and short cyan → tall cyan over p
  const beforeH = 0.92; // 9.2 / 10
  const afterH = 0.31; // 3.1 / 10

  return (
    <div className="mt-4 flex items-end justify-around gap-6" style={{ height: 220 }}>
      <ChartBar
        label="Before"
        sublabel="9.2 / 10"
        color="#ef4444"
        heightFrac={beforeH}
        p={p}
      />
      <ChartBar
        label="After"
        sublabel="3.1 / 10"
        color="#67e8f9"
        heightFrac={afterH * p + beforeH * (1 - p)} // morphs from "same as before" to lower
        p={p}
        primary
      />
    </div>
  );
}

function ChartBar({
  label,
  sublabel,
  color,
  heightFrac,
  p,
  primary,
}: {
  label: string;
  sublabel: string;
  color: string;
  heightFrac: number;
  p: number;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col items-center flex-1">
      <div className="relative w-full flex items-end justify-center" style={{ height: 160 }}>
        <div
          className="w-12 rounded-t-md"
          style={{
            height: `${heightFrac * 100}%`,
            background: color,
            opacity: primary ? Math.max(0.4, p) : 0.78,
            boxShadow: primary && p > 0.5 ? `0 0 18px ${color}55` : "none",
            transition: "none",
          }}
        />
      </div>
      <div className="mt-2 label-eyebrow">{label}</div>
      <div className="mt-1 font-mono text-[12px] text-text-secondary tabular-nums">{sublabel}</div>
    </div>
  );
}

/* ============================================================
   SCENE 6 — Brand close
   ============================================================ */
function SceneBrand({ t }: { t: number }) {
  // 7s scene:
  //   0.4s wordmark fades in + scales 0.96 → 1.00
  //   2.0s tagline fades in
  //   3.5s city list fades in
  //   5.0s gentle cyan pulse echo
  const wordP = Math.min(1, Math.max(0, (t - 200) / 800));
  const tagP = Math.min(1, Math.max(0, (t - 1800) / 700));
  const citiesP = Math.min(1, Math.max(0, (t - 3300) / 700));
  const inFade = Math.min(1, t / 300);

  return (
    <SceneFrame fade={inFade}>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Cyan halo */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(103,232,249,0.10), transparent 60%)",
            opacity: wordP,
            transition: "opacity 1.2s ease-out",
          }}
        />

        <div
          style={{
            opacity: wordP,
            transform: `scale(${0.96 + wordP * 0.04})`,
            transition: "opacity 800ms ease-out, transform 800ms ease-out",
          }}
        >
          <div
            className="font-display font-semibold tracking-[-0.05em] leading-none"
            style={{ fontSize: "clamp(80px, 11vw, 200px)" }}
          >
            Sentinel
          </div>
        </div>

        <div
          className="mt-6 text-[#9a9ea5] text-center max-w-[42ch]"
          style={{
            fontSize: "clamp(16px, 1.6vw, 22px)",
            opacity: tagP,
            transition: "opacity 700ms ease-out",
          }}
        >
          Autonomous crisis intelligence for living cities.
        </div>

        <div
          className="mt-10 flex items-center gap-5 font-mono text-[12px] tracking-[0.18em] uppercase text-[#6b6f76]"
          style={{
            opacity: citiesP,
            transition: "opacity 700ms ease-out",
          }}
        >
          <span>Karachi</span>
          <Dot />
          <span>Lahore</span>
          <Dot />
          <span>Multan</span>
          <Dot />
          <span>Islamabad</span>
        </div>
      </div>
    </SceneFrame>
  );
}

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-[#3a3d44]" />;
}

/* ============================================================
   Scene frame — provides consistent fade in/out
   ============================================================ */
function SceneFrame({ children, fade }: { children: React.ReactNode; fade: number }) {
  return (
    <div
      className="absolute inset-0"
      style={{ opacity: fade, transition: "opacity 600ms ease-out" }}
    >
      {children}
    </div>
  );
}

/* ============================================================
   FitStage — centers content and uniformly scales it DOWN so a
   timed (non-scrolling) scene never clips on a portrait phone.
   Content keeps its natural composition; only the scale changes.
   Re-measures as animated content changes size (ResizeObserver).
   ============================================================ */
function FitStage({
  children,
  pad = 18,
  maxWidth = 1320,
}: {
  children: React.ReactNode;
  pad?: number;
  maxWidth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = Math.max(1, window.innerWidth - pad * 2);
      const ch = Math.max(1, window.innerHeight - pad * 2);
      const nw = el.offsetWidth || 1;
      const nh = el.offsetHeight || 1;
      const s = Math.min(1, cw / nw, ch / nh);
      setScale(s > 0 ? s : 1);
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener("resize", measure);
    // Content animates (rows appear, counter grows) — re-check briefly.
    const iv = setInterval(measure, 600);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", measure);
      clearInterval(iv);
    };
  }, [pad]);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ padding: pad }}
    >
      <div
        ref={ref}
        style={{
          width: "100%",
          maxWidth,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          transition: "transform 250ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   FLASH — brief white flash for "critical event" punches
   ============================================================ */
function FlashPunch({ active, intensity = 0.18 }: { active: boolean; intensity?: number }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: "white",
        opacity: active ? intensity : 0,
        transition: "opacity 160ms ease-out",
        mixBlendMode: "overlay",
        zIndex: 40,
      }}
    />
  );
}

void ArrowRight;
