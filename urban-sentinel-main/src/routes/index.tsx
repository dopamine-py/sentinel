import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  Gauge,
  Layers,
  MapPin,
  PlayCircle,
  Radar,
  Radio,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import {
  AGENTS,
  AGENT_ORDER,
  ConfidenceMeter,
  CountUp,
  OrchestrationGraph,
  SentinelMark,
  SeverityChip,
  StatusPill,
  TickerStrip,
} from "../components/sentinel/primitives";
import { LIVE_SIGNALS, TICKER_ITEMS } from "../components/sentinel/data";
import { useLiveRuns, useLiveSignals } from "../components/sentinel/useLive";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sentinel — Autonomous crisis intelligence" },
      {
        name: "description",
        content:
          "Sentinel is an autonomous operations platform for cities. Six agents observe, verify, decide, execute and adapt — in seconds.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Nav />
      <Hero />
      <TickerStrip items={TICKER_ITEMS} />
      <Credibility />
      <Capabilities />
      <Architecture />
      <Operations />
      <Resilience />
      <NumbersStrip />
      <Cta />
      <Footer />
    </div>
  );
}

/* ============================================================
   NAV
   ============================================================ */
function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-surface-0/85 backdrop-blur-md border-b border-line">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 h-14 flex items-center justify-between">
        <SentinelMark />
        <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-text-secondary">
          <a href="#capabilities" className="hover:text-text-primary transition">Platform</a>
          <a href="#architecture" className="hover:text-text-primary transition">Architecture</a>
          <a href="#operations" className="hover:text-text-primary transition">Operations</a>
          <a href="#resilience" className="hover:text-text-primary transition">Resilience</a>
          <a href="#numbers" className="hover:text-text-primary transition">Customers</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/onboarding" className="hidden sm:inline-flex btn-ghost text-[13px]">
            Sign in
          </Link>
          <Link to="/dashboard" className="btn-primary text-[13px]">
            Open console
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   HERO — clean, Linear-grade
   ============================================================ */
function Hero() {
  return (
    <section className="relative">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <div className="absolute inset-0 hero-grid pointer-events-none" />

      <div className="relative mx-auto max-w-6xl px-5 lg:px-8 pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="flex items-center gap-2 animate-rise">
          <StatusPill state="online" label="6 agents · operational" />
          <span className="hidden sm:inline-flex label-eyebrow">v4.7 · build 2025.05</span>
        </div>

        <h1 className="mt-10 font-display font-semibold text-[44px] md:text-[64px] lg:text-[76px] leading-[0.96] tracking-[-0.035em] max-w-4xl animate-rise">
          The operating system
          <br />
          <span className="text-text-secondary">for autonomous response.</span>
        </h1>

        <p className="mt-7 max-w-2xl text-[16px] md:text-[17px] leading-[1.55] text-text-secondary animate-rise">
          Sentinel ingests citizen reports, weather, traffic and infrastructure telemetry — then a mesh
          of six agents observes, verifies, decides, executes and adapts. Built for cities that can't afford to be slow.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3 animate-rise">
          <Link to="/dashboard" className="btn-primary text-[14px]">
            Open the live console <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <a href="#architecture" className="btn-ghost text-[14px]">
            See architecture <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <span className="ml-1 text-[12.5px] text-text-tertiary">
            <kbd className="kbd">⌘</kbd> <kbd className="kbd">K</kbd>{" "}
            <span className="ml-1">from anywhere in the console</span>
          </span>
        </div>

        <HeroConsole />
      </div>
    </section>
  );
}

function HeroConsole() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => (v + 1) % 8), 1400);
    return () => clearInterval(t);
  }, []);

  const activeIndex = Math.min(tick, 5);

  // Pull a small slice of real backend signals to render in the hero rail.
  const { signals: liveSignals } = useLiveSignals({ intervalMs: 10000, max: 8 });
  const heroSignals = liveSignals.length > 0 ? liveSignals : LIVE_SIGNALS;

  return (
    <div className="relative mt-14 md:mt-20 animate-rise">
      <div className="surface-raised p-1 md:p-1.5">
        <div className="rounded-md overflow-hidden border border-line bg-surface-1">
          {/* Window chrome */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-surface-2/50">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-status-critical/40" />
              <span className="h-2.5 w-2.5 rounded-full bg-status-warn/40" />
              <span className="h-2.5 w-2.5 rounded-full bg-status-ok/40" />
              <span className="ml-3 font-mono text-[10.5px] text-text-tertiary">sentinel.app/console</span>
            </div>
            <span className="font-mono text-[10.5px] text-text-tertiary">
              T+{String(tick * 218).padStart(4, "0")}ms · INC-04812
            </span>
          </div>

          {/* Body */}
          <div className="grid lg:grid-cols-[260px_1fr_220px] gap-0">
            {/* Sidebar */}
            <div className="hidden lg:flex flex-col gap-4 p-4 border-r border-line bg-surface-1">
              <div>
                <div className="label-eyebrow">Workspace</div>
                <div className="mt-2 text-[13px] font-medium">Karachi Metro</div>
              </div>
              <div className="divider-y -mx-4" />
              <nav className="text-[13px] -mx-1.5">
                {[
                  ["Overview", true],
                  ["Orchestration", false],
                  ["Actions", false],
                  ["Outcomes", false],
                ].map(([l, on]) => (
                  <div
                    key={l as string}
                    className={`px-2.5 py-1.5 rounded-md ${
                      on ? "bg-surface-2 text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {l}
                  </div>
                ))}
              </nav>
              <div className="divider-y -mx-4" />
              <div className="space-y-1">
                <div className="label-eyebrow">Active mesh</div>
                {AGENT_ORDER.slice(0, 4).map((k) => {
                  const a = AGENTS[k];
                  return (
                    <div key={k} className="flex items-center gap-2 py-1">
                      <a.icon className="h-3.5 w-3.5 text-text-secondary" strokeWidth={1.75} />
                      <span className="text-[12px] text-text-secondary">{a.short}</span>
                      <span className="ml-auto dot-pulse dot-ok text-status-ok" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Main */}
            <div className="p-5 lg:p-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <Radar className="h-4 w-4 text-status-alert" />
                  <span className="text-[14px] font-medium">Urban flooding · Saddar, Karachi</span>
                </div>
                <SeverityChip severity="CRITICAL" />
              </div>
              <p className="mt-2 text-[13px] text-text-secondary leading-relaxed max-w-[60ch]">
                218 cross-source signals corroborate waist-deep flooding across four intersections.
                Decision agent has drafted five prioritized actions; three are already in flight.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <ConsoleMetric label="Confidence" value="0.92" delta="↑ 4" />
                <ConsoleMetric label="Decision latency" value="1.42s" delta="−0.18" />
                <ConsoleMetric label="Actions" value="3 / 5" delta="2 ack" />
              </div>

              <div className="mt-5 pt-5 border-t border-line">
                <div className="flex items-center justify-between">
                  <span className="label-eyebrow">Agent orchestration</span>
                  <span className="font-mono text-[10.5px] text-text-tertiary">
                    {AGENT_ORDER[activeIndex]?.toUpperCase() ?? "MESH IDLE"}
                  </span>
                </div>
                <OrchestrationGraph activeIndex={activeIndex} compact />
              </div>
            </div>

            {/* Right rail */}
            <div className="hidden lg:flex flex-col gap-3 p-4 border-l border-line bg-surface-1">
              <div className="label-eyebrow">Recent signals</div>
              {heroSignals.slice(0, 4).map((s, i) => (
                <div key={i} className="text-[12px] leading-snug">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                      {s.src}
                    </span>
                    <span className="font-mono text-[10px] text-text-tertiary">now</span>
                  </div>
                  <p className="text-text-primary line-clamp-2 mt-0.5">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsoleMetric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <div className="surface-input p-3 rounded-md">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-1.5 font-display text-[18px] font-semibold tracking-tight">{value}</div>
      {delta && <div className="mt-1 font-mono text-[11px] text-text-tertiary">{delta}</div>}
    </div>
  );
}

/* ============================================================
   CREDIBILITY ROW
   ============================================================ */
function Credibility() {
  const items = [
    { icon: ShieldCheck, label: "Audit-grade reasoning logs" },
    { icon: Database, label: "Multi-source corroboration" },
    { icon: Workflow, label: "Live response orchestration" },
    { icon: Brain, label: "Adaptive decision loop" },
  ];
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2.5">
            <it.icon className="h-4 w-4 text-text-tertiary" strokeWidth={1.75} />
            <span className="text-[13px] text-text-secondary">{it.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   CAPABILITIES — sober two-column layout
   ============================================================ */
function Capabilities() {
  const stages = [
    {
      n: "01",
      icon: Radio,
      title: "Signal ingestion",
      copy:
        "Citizen reports in Urdu and English, social posts, weather radar, traffic cameras, SCADA telemetry, and 911 — into a single observable bus.",
    },
    {
      n: "02",
      icon: ShieldCheck,
      title: "Verification",
      copy:
        "Cross-source corroboration produces a trust score per signal. Adversarial and stale inputs are surfaced, not silently dropped.",
    },
    {
      n: "03",
      icon: Brain,
      title: "Decision",
      copy:
        "An LLM-plus-classical hybrid classifies the crisis, scores severity, and drafts a prioritized plan against coverage, cost and SLA.",
    },
    {
      n: "04",
      icon: Workflow,
      title: "Execution",
      copy:
        "Dispatches across radio, SMS, traffic APIs, hospital queueing and SCADA — every step with ack/retry semantics and a chain of custody.",
    },
    {
      n: "05",
      icon: Gauge,
      title: "Monitoring & adaptation",
      copy:
        "Predicted versus observed outcomes drive the next decision. When ground truth drifts, the plan is revised and rebroadcast.",
    },
  ];

  return (
    <section id="capabilities" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-20 md:py-28">
        <SectionHeader
          eyebrow="Platform"
          title="A continuous loop — not a chatbot."
          sub="Five stages run on a self-healing mesh. Each one is auditable, each one can be paused or overridden by a human commander."
        />

        <div className="mt-14 grid md:grid-cols-2 gap-x-12 gap-y-12">
          {stages.map((s) => (
            <article key={s.n} className="flex items-start gap-5">
              <div className="shrink-0">
                <div className="label-eyebrow">{s.n}</div>
                <div className="mt-3 h-9 w-9 rounded-md surface-input flex items-center justify-center">
                  <s.icon className="h-4 w-4 text-text-primary" strokeWidth={1.75} />
                </div>
              </div>
              <div>
                <h3 className="font-display text-[20px] font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[14.5px] text-text-secondary leading-[1.6] max-w-[52ch]">
                  {s.copy}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="label-eyebrow">{eyebrow}</div>
      <h2 className="mt-3 font-display text-[34px] md:text-[44px] font-semibold tracking-[-0.025em] leading-[1.05]">
        {title}
      </h2>
      <p className="mt-4 text-[16px] text-text-secondary leading-relaxed">{sub}</p>
    </div>
  );
}

/* ============================================================
   ARCHITECTURE — sober schematic, no scanlines
   ============================================================ */
function Architecture() {
  return (
    <section id="architecture" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-20 md:py-28">
        <SectionHeader
          eyebrow="Architecture"
          title="A hierarchical mesh, in plain view."
          sub="Signals flow left to right. Memory is shared. Every output is traced, every fallback is named."
        />

        <div className="mt-12 surface p-6 md:p-10">
          <ArchDiagram />
        </div>

        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <ArchHighlight
            title="Hierarchical agent mesh"
            copy="Six agents — Scout, Verification, Decision, Execution, Monitoring, Adaptation — run on a Raft-consensus mesh. The leader maintains authoritative state."
          />
          <ArchHighlight
            title="Hybrid memory"
            copy="HNSW vector recall over case history plus relational ground truth. Every reasoning trace is checkpointed and exportable."
          />
          <ArchHighlight
            title="Trust-gated execution"
            copy="No dispatch fires below the trust floor. Conflicts trigger named fallbacks, not silent suppression."
          />
        </div>
      </div>
    </section>
  );
}

function ArchHighlight({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="surface p-5">
      <h4 className="font-display text-[15px] font-semibold tracking-tight">{title}</h4>
      <p className="mt-2 text-[13.5px] text-text-secondary leading-relaxed">{copy}</p>
    </div>
  );
}

function ArchDiagram() {
  return (
    <div className="relative">
      <svg viewBox="0 0 1100 280" className="w-full h-auto">
        <defs>
          <linearGradient id="archFlow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(103,232,249,0)" />
            <stop offset="50%" stopColor="rgba(103,232,249,0.65)" />
            <stop offset="100%" stopColor="rgba(103,232,249,0)" />
          </linearGradient>
        </defs>

        {/* sources column */}
        <text x="60" y="40" fill="rgba(255,255,255,0.45)" fontSize="10" fontFamily="JetBrains Mono">
          SOURCES
        </text>
        {["Citizen", "Twitter", "Weather", "Traffic", "SCADA"].map((s, i) => (
          <g key={s} transform={`translate(20, ${60 + i * 36})`}>
            <rect width="130" height="26" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.10)" />
            <circle cx="14" cy="13" r="3" fill="rgba(103, 232, 249, 0.7)" />
            <text x="28" y="17" fill="rgba(255,255,255,0.80)" fontSize="11" fontFamily="Inter">
              {s}
            </text>
          </g>
        ))}

        {/* nodes */}
        <ArchNode x={260} y={130} label="Scout" sub="ingest · dedup" />
        <ArchNode x={420} y={70}  label="Verification" sub="cross-check" />
        <ArchNode x={420} y={210} label="Memory" sub="hnsw · sql" muted />
        <ArchNode x={580} y={130} label="Decision" sub="reason · plan" />
        <ArchNode x={740} y={70}  label="Execution" sub="dispatch" />
        <ArchNode x={740} y={210} label="Simulation" sub="monte-carlo" muted />
        <ArchNode x={900} y={130} label="Monitoring" sub="kpi · drift" />
        <ArchNode x={1040} y={130} label="Adapt" sub="learn · revise" />

        {/* lines */}
        {[
          "M 150,73 C 200,73 220,130 260,130",
          "M 150,109 C 200,109 220,130 260,130",
          "M 150,145 C 200,145 220,130 260,130",
          "M 150,181 C 200,181 220,130 260,130",
          "M 310,130 C 370,130 380,80 420,80",
          "M 310,130 C 370,130 380,200 420,200",
          "M 470,80 C 530,80 540,130 580,130",
          "M 470,200 C 530,200 540,140 580,140",
          "M 630,130 C 700,130 710,80 740,80",
          "M 630,130 C 700,130 710,200 740,200",
          "M 790,80 C 850,80 870,130 900,130",
          "M 790,200 C 850,200 870,140 900,140",
          "M 950,130 C 990,130 1010,130 1040,130",
        ].map((d, i) => (
          <g key={i}>
            <path d={d} stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none" />
            <path
              d={d}
              stroke="url(#archFlow)"
              strokeWidth="1.2"
              fill="none"
              strokeDasharray="4 6"
              className="data-line"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

function ArchNode({
  x,
  y,
  label,
  sub,
  muted,
}: {
  x: number;
  y: number;
  label: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <g transform={`translate(${x - 50}, ${y - 22})`}>
      <rect
        width="100"
        height="44"
        rx="6"
        fill="rgba(14,16,20,0.96)"
        stroke={muted ? "rgba(255,255,255,0.10)" : "rgba(103, 232, 249, 0.32)"}
      />
      <text x="50" y="20" fill="white" fontSize="11.5" fontFamily="Inter" fontWeight="600" textAnchor="middle">
        {label}
      </text>
      <text x="50" y="33" fill="rgba(255,255,255,0.50)" fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle">
        {sub}
      </text>
    </g>
  );
}

/* ============================================================
   OPERATIONS — three-up showing real-feeling product screens
   ============================================================ */
function Operations() {
  const { signals: liveSignals } = useLiveSignals({ intervalMs: 10000, max: 6 });
  const opsSignals = liveSignals.length > 0 ? liveSignals : LIVE_SIGNALS;
  return (
    <section id="operations" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-20 md:py-28">
        <SectionHeader
          eyebrow="Operations"
          title="Built for incident commanders, not slides."
          sub="A console that gets denser when it has more to say — and quieter when there's nothing to do."
        />

        <div className="mt-12 grid md:grid-cols-3 gap-5">
          <OpsCard
            title="Live signal feed"
            copy="Citizen reports, weather, traffic and sensors — deduped, geocoded, ranked by trust."
          >
            <div className="space-y-2">
              {opsSignals.slice(0, 3).map((s, i) => (
                <div key={i} className="surface-input rounded-md p-2.5 text-[11.5px] leading-snug">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">{s.src}</span>
                    <span className="font-mono text-[10px] text-text-tertiary">now</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-text-primary">{s.text}</p>
                </div>
              ))}
            </div>
          </OpsCard>

          <OpsCard
            title="Reasoning trace"
            copy="Every decision is shown with its inputs, evidence, tool calls and confidence — auditable end-to-end."
          >
            <div className="font-mono text-[11px] leading-relaxed text-text-secondary space-y-1.5">
              <div><span className="text-accent-cyan">01</span> scout.ingest <span className="text-text-tertiary">→ 218 signals</span></div>
              <div><span className="text-accent-cyan">02</span> verify.crosscheck <span className="text-text-tertiary">trust=0.91</span></div>
              <div><span className="text-accent-cyan">03</span> decision.classify <span className="text-text-tertiary">flood p=0.92</span></div>
              <div><span className="text-accent-cyan">04</span> execution.dispatch <span className="text-text-tertiary">5 actions</span></div>
              <div><span className="text-accent-cyan">05</span> monitor.simulate <span className="text-text-tertiary">P50=managed</span></div>
              <div><span className="text-accent-cyan">06</span> adapt.update <span className="text-text-tertiary">v2 broadcast</span></div>
            </div>
          </OpsCard>

          <OpsCard
            title="Outcome ledger"
            copy="Before-and-after states with attribution to specific actions. After-action briefs export as Markdown or PDF."
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-text-secondary">Congestion</span>
                <span className="font-mono text-text-tertiary">9.2 → <span className="text-status-ok">3.1</span></span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-text-secondary">Avg speed</span>
                <span className="font-mono text-text-tertiary">4 → <span className="text-status-ok">38</span> km/h</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-text-secondary">ETA to managed</span>
                <span className="font-mono text-text-tertiary">T+92m</span>
              </div>
              <div className="pt-2"><ConfidenceMeter value={0.87} label="Composite KPI" /></div>
            </div>
          </OpsCard>
        </div>
      </div>
    </section>
  );
}

function OpsCard({
  title,
  copy,
  children,
}: {
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface p-5 flex flex-col">
      <h3 className="font-display text-[16px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-[13px] text-text-secondary leading-relaxed">{copy}</p>
      <div className="mt-5 pt-5 border-t border-line">{children}</div>
    </div>
  );
}

/* ============================================================
   RESILIENCE
   ============================================================ */
function Resilience() {
  const cases = [
    {
      title: "Conflicting reports",
      body:
        "When citizen reports contradict sensor data, Verification flags the mismatch, lowers confidence, and requests ground-truth confirmation from the nearest unit.",
    },
    {
      title: "Stale data sources",
      body:
        "If a SCADA RTU stops reporting, Adaptation switches to the secondary feed and broadcasts a Plan v2 with reduced trust until ack returns.",
    },
    {
      title: "Failed APIs",
      body:
        "Dispatch retries with exponential backoff across channels. If three fail, the incident escalates to a human commander with the reasoning trace attached.",
    },
  ];
  return (
    <section id="resilience" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-20 md:py-28">
        <SectionHeader
          eyebrow="Resilience"
          title="When the world is wrong, the system knows."
          sub="Sentinel doesn't pretend signals are clean. Every contradiction lowers confidence, surfaces a fallback, and shows exactly how the plan adapted."
        />

        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {cases.map((c) => (
            <div key={c.title} className="surface p-5">
              <h3 className="font-display text-[16px] font-semibold tracking-tight">{c.title}</h3>
              <p className="mt-2 text-[13.5px] text-text-secondary leading-relaxed">{c.body}</p>
              <pre className="mt-4 rounded-md surface-input p-3 font-mono text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap">
{`sentinel.adapt(
  trust_floor=0.71,
  fallback="alt_source"
) → plan_v2`}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   NUMBERS STRIP — quiet, monochrome
   ============================================================ */
function NumbersStrip() {
  // Pull real backend totals. If the backend isn't reachable, fall back to
  // honest placeholders so the page still has shape.
  const { runs, online } = useLiveRuns({ intervalMs: 10000 });
  const totalRuns = runs.length;

  // Active = critical + high severities
  const critical = runs.filter(
    (r) => String((r as { severity?: string }).severity || "").toLowerCase() === "critical"
  ).length;
  const high = runs.filter(
    (r) => String((r as { severity?: string }).severity || "").toLowerCase() === "high"
  ).length;
  const activeIncidents = critical + high;

  // Unique crisis types observed
  const types = new Set(runs.map((r) => (r as { crisis_type?: string }).crisis_type).filter(Boolean));

  const stats: { value: number; label: string; suffix: string }[] = online
    ? [
        { value: totalRuns,        label: "Runs analyzed",       suffix: "" },
        { value: activeIncidents,  label: "Active incidents",    suffix: "" },
        { value: types.size,       label: "Crisis types seen",   suffix: "" },
        { value: 6,                label: "Autonomous agents",   suffix: "" },
      ]
    : [
        { value: 0,                label: "Runs analyzed",       suffix: "" },
        { value: 0,                label: "Active incidents",    suffix: "" },
        { value: 0,                label: "Crisis types seen",   suffix: "" },
        { value: 6,                label: "Autonomous agents",   suffix: "" },
      ];

  return (
    <section id="numbers" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-14 grid grid-cols-2 md:grid-cols-4 gap-y-8">
        {stats.map((s) => (
          <div key={s.label}>
            <CountUp
              value={s.value}
              className="font-display text-[34px] md:text-[44px] font-semibold tracking-tight"
              format={(n) => `${n.toLocaleString()}${s.suffix}`}
            />
            <div className="mt-1 label-eyebrow">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   CTA
   ============================================================ */
function Cta() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-24">
        <div className="max-w-3xl">
          <h2 className="font-display text-[34px] md:text-[48px] font-semibold tracking-[-0.025em] leading-[1.05]">
            Bring your city online.
          </h2>
          <p className="mt-4 text-[16.5px] text-text-secondary leading-relaxed max-w-2xl">
            Pick a scenario or pipe in your own signal stream. Watch six agents observe, verify, decide,
            execute and adapt — in seconds, in front of you.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/dashboard" className="btn-primary text-[14px]">
              <PlayCircle className="h-3.5 w-3.5" /> Open the live console
            </Link>
            <Link to="/onboarding" className="btn-ghost text-[14px]">
              <Layers className="h-3.5 w-3.5" /> Onboard a city
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   FOOTER
   ============================================================ */
function Footer() {
  return (
    <footer>
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-12 grid md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10">
        <div>
          <SentinelMark />
          <p className="mt-4 text-[13px] text-text-tertiary max-w-xs leading-relaxed">
            Autonomous crisis intelligence and emergency response orchestration. Built for cities that
            can't afford to be slow.
          </p>
          <div className="mt-4">
            <StatusPill state="online" label="All systems operational" />
          </div>
        </div>
        <FooterCol title="Platform" items={["Console", "Orchestration", "Outcomes", "API"]} />
        <FooterCol title="Resources" items={["Architecture", "Changelog", "Security", "Status"]} />
        <FooterCol title="Company" items={["About", "Customers", "Press", "Contact"]} />
      </div>
      <div className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 lg:px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-3 text-[12px] text-text-tertiary">
          <span>© Sentinel · 2025</span>
          <span className="font-mono">build v4.7 · sentinel-ops</span>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-status-ok" />
            <span>SOC 2 Type II</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="label-eyebrow">{title}</div>
      <ul className="mt-3 space-y-2 text-[13px]">
        {items.map((it) => (
          <li key={it} className="text-text-secondary hover:text-text-primary transition cursor-pointer">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Unused-but-imported scrub to satisfy lint */
void ChevronRight;
void Clock;
void MapPin;
