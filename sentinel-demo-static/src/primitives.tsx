import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Eye,
  Radio,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";

/* ============================================================
   BRAND MARK
   ============================================================ */
export function SentinelMark({
  size = "md",
  showWordmark = true,
}: {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
}) {
  const dims = size === "sm" ? "h-6 w-6" : size === "lg" ? "h-9 w-9" : "h-7 w-7";
  const txt = size === "sm" ? "text-[13px]" : size === "lg" ? "text-base" : "text-[14px]";
  return (
    <div className="flex items-center gap-2.5 group">
      <div
        className={`relative ${dims} rounded-md flex items-center justify-center`}
        style={{
          background: "linear-gradient(180deg, #1a1d22 0%, #0e1014 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Eye className="h-1/2 w-1/2 text-accent-cyan" strokeWidth={2} />
      </div>
      {showWordmark && (
        <div className="leading-none">
          <div className={`font-display font-semibold tracking-tight ${txt}`}>
            Sentinel
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   STATUS PILL — quiet system heartbeat
   ============================================================ */
export function StatusPill({
  state = "online",
  label,
}: {
  state?: "online" | "alert" | "degraded" | "offline";
  label?: string;
}) {
  const map = {
    online: { dot: "dot-ok", text: "text-status-ok", msg: "Operational" },
    alert: { dot: "dot-alert", text: "text-status-alert", msg: "Active incident" },
    degraded: { dot: "dot-warn", text: "text-status-warn", msg: "Degraded" },
    offline: { dot: "dot-pulse", text: "text-tertiary", msg: "Offline" },
  } as const;
  const c = map[state];
  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md surface-input text-[12px]">
      <span
        className={`dot-pulse ${c.dot} ${c.text}`}
        style={{ width: 6, height: 6 }}
      />
      <span className={`${c.text} font-medium tracking-tight`}>{label ?? c.msg}</span>
    </span>
  );
}

/* ============================================================
   SURFACE CARD — flat, hairline border, optional accent strip
   ============================================================ */
export function HudCard({
  children,
  label,
  badge,
  className = "",
  raised = false,
}: {
  children: ReactNode;
  label?: string;
  badge?: ReactNode;
  className?: string;
  corners?: boolean; // accepted for backwards compat; intentionally unused
  glow?: boolean;    // accepted for backwards compat; intentionally unused
  raised?: boolean;
}) {
  return (
    <div className={`${raised ? "surface-raised" : "surface"} p-5 ${className}`}>
      {(label || badge) && (
        <div className="flex items-center justify-between mb-4">
          {label && <span className="label-eyebrow">{label}</span>}
          {badge}
        </div>
      )}
      {children}
    </div>
  );
}

/* ============================================================
   CONFIDENCE METER — thin bar + small percentage
   ============================================================ */
export function ConfidenceMeter({
  value,
  delta,
  label = "Confidence",
  showLabel = true,
}: {
  value: number;
  delta?: number;
  label?: string;
  showLabel?: boolean;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      {showLabel && (
        <div className="flex items-center justify-between text-[11px]">
          <span className="label-eyebrow">{label}</span>
          <span className="font-mono text-text-secondary">
            {pct}%
            {typeof delta === "number" && (
              <span className={`ml-1.5 ${delta >= 0 ? "text-status-ok" : "text-status-alert"}`}>
                {delta >= 0 ? "↑" : "↓"}
                {Math.abs(Math.round(delta * 100))}
              </span>
            )}
          </span>
        </div>
      )}
      <div className="mt-1.5 confidence-track">
        <div className="confidence-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ============================================================
   SEVERITY PILL
   ============================================================ */
export function SeverityChip({ severity }: { severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" }) {
  const cls =
    severity === "CRITICAL"
      ? "pill-critical"
      : severity === "HIGH"
        ? "pill-high"
        : severity === "MEDIUM"
          ? "pill-medium"
          : "pill-low";
  return <span className={`pill ${cls}`}>{severity}</span>;
}

/* ============================================================
   AGENTS — canonical roster
   ============================================================ */
export type AgentKey =
  | "scout"
  | "verification"
  | "decision"
  | "execution"
  | "monitoring"
  | "adaptation";

export const AGENTS: Record<
  AgentKey,
  {
    key: AgentKey;
    name: string;
    short: string;
    code: string;
    role: string;
    icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  }
> = {
  scout: {
    key: "scout",
    name: "Scout",
    short: "Scout",
    code: "AGT.01",
    role: "Streams citizen, social, weather and traffic signals into the bus.",
    icon: Radio,
  },
  verification: {
    key: "verification",
    name: "Verification",
    short: "Verification",
    code: "AGT.02",
    role: "Cross-checks every signal, suppresses noise, scores trust.",
    icon: ShieldCheck,
  },
  decision: {
    key: "decision",
    name: "Decision",
    short: "Decision",
    code: "AGT.03",
    role: "Reasons over evidence, classifies the crisis, drafts a plan.",
    icon: Brain,
  },
  execution: {
    key: "execution",
    name: "Execution",
    short: "Execution",
    code: "AGT.04",
    role: "Dispatches across radio, SMS, traffic and SCADA channels.",
    icon: Workflow,
  },
  monitoring: {
    key: "monitoring",
    name: "Monitoring",
    short: "Monitoring",
    code: "AGT.05",
    role: "Tracks outcomes, throughput, congestion and response effectiveness.",
    icon: Activity,
  },
  adaptation: {
    key: "adaptation",
    name: "Adaptation",
    short: "Adaptation",
    code: "AGT.06",
    role: "Revises the plan as ground truth changes; learns from outcomes.",
    icon: Sparkles,
  },
};

export const AGENT_ORDER: AgentKey[] = [
  "scout",
  "verification",
  "decision",
  "execution",
  "monitoring",
  "adaptation",
];

/* ============================================================
   AGENT NODE — restrained
   ============================================================ */
export function AgentNode({
  agent,
  state = "idle",
  size = "md",
}: {
  agent: (typeof AGENTS)[AgentKey];
  active?: boolean;
  state?: "idle" | "running" | "done" | "error";
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const Icon = agent.icon;
  const ring =
    state === "running"
      ? "border-accent-cyan/55"
      : state === "done"
        ? "border-status-ok/45"
        : state === "error"
          ? "border-status-critical/45"
          : "border-white/8";
  const iconColor =
    state === "running"
      ? "text-accent-cyan"
      : state === "done"
        ? "text-status-ok"
        : state === "error"
          ? "text-status-critical"
          : "text-text-secondary";
  return (
    <div className="flex flex-col items-center">
      <div
        className={`${dim} rounded-md border bg-surface-2 ${ring} flex items-center justify-center relative`}
      >
        <Icon className={`h-1/2 w-1/2 ${iconColor}`} strokeWidth={1.75} />
        {state === "running" && (
          <span
            className="absolute -inset-1 rounded-md border border-accent-cyan/40 animate-pulse-soft"
            aria-hidden
          />
        )}
      </div>
      <div className="mt-2 text-center">
        <div className="label-eyebrow text-[9px]">{agent.code}</div>
        <div className="text-[11px] text-text-primary font-medium leading-tight mt-0.5">{agent.short}</div>
      </div>
    </div>
  );
}

/* ============================================================
   ORCHESTRATION GRAPH — clean L→R workflow
   ============================================================ */
export function OrchestrationGraph({
  activeIndex = -1,
  compact = false,
}: {
  activeIndex?: number;
  compact?: boolean;
}) {
  const order = AGENT_ORDER;
  return (
    <div className={`relative ${compact ? "py-6" : "py-8"} px-4`}>
      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        viewBox="0 0 600 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="flow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(103,232,249,0)" />
            <stop offset="50%" stopColor="rgba(103,232,249,0.65)" />
            <stop offset="100%" stopColor="rgba(103,232,249,0)" />
          </linearGradient>
        </defs>
        {order.slice(0, -1).map((_, i) => {
          const x1 = 60 + i * 96;
          const x2 = 60 + (i + 1) * 96;
          const isLive = i < activeIndex;
          return (
            <g key={i}>
              <line x1={x1} y1={50} x2={x2} y2={50} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              {isLive && (
                <line
                  x1={x1}
                  y1={50}
                  x2={x2}
                  y2={50}
                  stroke="url(#flow)"
                  strokeWidth={1.4}
                  strokeDasharray="4 6"
                  className="data-line"
                />
              )}
            </g>
          );
        })}
      </svg>

      <div className="relative grid grid-cols-6 gap-3">
        {order.map((key, i) => {
          const state: "idle" | "running" | "done" =
            activeIndex < 0
              ? "idle"
              : i < activeIndex
                ? "done"
                : i === activeIndex
                  ? "running"
                  : "idle";
          return (
            <div key={key} className="flex justify-center">
              <AgentNode agent={AGENTS[key]} state={state} size={compact ? "sm" : "md"} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   RADAR DISPLAY — minimal, functional
   ============================================================ */
export function RadarDisplay({ size = 200 }: { size?: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, i) => ({
        x: 50 + Math.cos((i / 7) * 2 * Math.PI + i * 0.4) * (12 + (i % 3) * 12),
        y: 50 + Math.sin((i / 7) * 2 * Math.PI + i * 0.4) * (12 + (i % 3) * 12),
        s: 2 + (i % 2),
        c:
          i % 4 === 0
            ? "var(--status-critical)"
            : i % 4 === 1
              ? "var(--status-warn)"
              : "var(--accent-cyan)",
        d: (i * 0.6) % 3,
      })),
    []
  );
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full radar-ring" />
      <div className="absolute inset-0 rounded-full radar-sweep opacity-90" />
      <div className="absolute inset-0 rounded-full border border-line" />
      <div className="absolute inset-0">
        {dots.map((d, i) => (
          <span
            key={i}
            className="absolute rounded-full dot-pulse"
            style={{
              left: `${d.x}%`,
              top: `${d.y}%`,
              width: d.s * 2,
              height: d.s * 2,
              background: d.c,
              color: d.c,
              animationDelay: `${d.d}s`,
            }}
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-1 w-1 rounded-full bg-accent-cyan" />
      </div>
    </div>
  );
}

/* ============================================================
   COUNT UP — viewport-triggered
   ============================================================ */
export function CountUp({
  value,
  duration = 1200,
  format = (n) => n.toLocaleString(),
  className = "",
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const start = performance.now();
          const tick = (t: number) => {
            const p = Math.min(1, (t - start) / duration);
            setN(value * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);
  return (
    <div ref={ref} className={className}>
      {format(Math.floor(n))}
    </div>
  );
}

/* ============================================================
   LIVE SIGNAL FEED — Linear-grade list rows
   ============================================================ */
export type Signal = {
  src: string;
  text: string;
  color?: string;
  ts?: string;
  geo?: string;
};

export function LiveSignalFeed({
  signals,
  max = 5,
  title = "Live signals",
  intervalMs = 2800,
}: {
  signals: Signal[];
  max?: number;
  title?: string;
  intervalMs?: number;
}) {
  const [feed, setFeed] = useState(() => signals.slice(0, max));
  const idx = useRef(max);
  useEffect(() => {
    const t = setInterval(() => {
      const next = signals[idx.current % signals.length];
      idx.current += 1;
      setFeed((f) => [{ ...next, ts: "now" }, ...f].slice(0, max));
    }, intervalMs);
    return () => clearInterval(t);
  }, [signals, max, intervalMs]);
  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between pb-3 mb-2 divider-y">
        <div className="flex items-center gap-2">
          <span className="dot-pulse dot-ok text-status-ok" />
          <span className="text-[12.5px] font-medium tracking-tight">{title}</span>
        </div>
        <span className="label-eyebrow">streaming</span>
      </div>
      <ul className="space-y-1">
        {feed.map((s, i) => (
          <li key={`${s.text}-${i}`} className="px-1 py-1.5 row-hover rounded-md animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-secondary">
                {s.src}
              </span>
              <span className="font-mono text-[10.5px] text-text-tertiary">{s.ts ?? "1s"}</span>
            </div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-text-primary">{s.text}</p>
            {s.geo && (
              <p className="mt-1 font-mono text-[10.5px] text-text-tertiary">{s.geo}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================
   STAT TILE — flat
   ============================================================ */
export function StatTile({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  hint?: string;
  tone?: "cyan" | "emerald" | "amber" | "rose" | "violet"; // unused; kept for compat
}) {
  return (
    <div className="surface-input rounded-lg p-3.5">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-1.5 font-display text-[22px] md:text-[26px] font-semibold leading-none tracking-tight text-text-primary">
        {value}
      </div>
      {(delta || hint) && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-text-tertiary">
          {hint && <span>{hint}</span>}
          {delta && <span className="font-mono text-text-secondary">{delta}</span>}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TICKER STRIP — quiet operational bar
   ============================================================ */
export function TickerStrip({ items }: { items: string[] }) {
  return (
    <div className="ticker-mask overflow-hidden border-y border-line bg-surface-1/60">
      <div className="flex">
        <div
          className="flex shrink-0 gap-10 py-2 whitespace-nowrap"
          style={{ animation: "loaderSweep 0s linear", animationName: "tickerScroll" }}
        >
          <style>{`
            @keyframes tickerScroll {
              from { transform: translateX(0); }
              to { transform: translateX(-50%); }
            }
            .ticker-loop {
              animation: tickerScroll 45s linear infinite;
              display: flex; gap: 2.5rem; padding-right: 2.5rem;
            }
          `}</style>
          <div className="ticker-loop">
            {[...items, ...items].map((t, i) => (
              <span key={i} className="font-mono text-[10.5px] text-text-tertiary tracking-wider">
                <span className="text-accent-cyan mr-2">·</span>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ICONS — re-export grouping for convenience
   ============================================================ */
export const ICONS = {
  Zap,
  Brain,
  Activity,
  Workflow,
  ShieldCheck,
  Radio,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Eye,
};
