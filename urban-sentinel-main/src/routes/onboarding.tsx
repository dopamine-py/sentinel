import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Brain,
  CheckCircle2,
  ChevronRight,
  Lock,
  Mail,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  AGENTS,
  AGENT_ORDER,
  OrchestrationGraph,
  RadarDisplay,
  SentinelMark,
  StatusPill,
} from "../components/sentinel/primitives";
import { CITIES } from "../components/sentinel/data";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Sentinel — Onboarding" },
      { name: "description", content: "Bring your city online." },
    ],
  }),
  component: Onboarding,
});

type Role = "incident_commander" | "dispatcher" | "city_official" | "analyst";

function Onboarding() {
  const [step, setStep] = useState(0);
  const [city, setCity] = useState<string>("karachi");
  const [role, setRole] = useState<Role>("incident_commander");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [prefs, setPrefs] = useState({ critical: true, high: true, medium: false, lowRedraft: false });
  const [agents, setAgents] = useState<Record<string, boolean>>({
    scout: true,
    verification: true,
    decision: true,
    execution: true,
    monitoring: true,
    adaptation: true,
  });

  const navigate = useNavigate();
  const total = 4;
  const next = () => setStep((s) => Math.min(s + 1, total));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header step={step} total={total} />

      <div className="mx-auto max-w-5xl px-5 lg:px-8 py-10 lg:py-16 grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-start">
        <main className="space-y-8 min-h-[480px]">
          {step === 0 && (
            <WelcomeStep
              name={name}
              setName={setName}
              email={email}
              setEmail={setEmail}
              role={role}
              setRole={setRole}
            />
          )}
          {step === 1 && <CityStep city={city} setCity={setCity} />}
          {step === 2 && (
            <NotificationStep prefs={prefs} setPrefs={setPrefs} agents={agents} setAgents={setAgents} />
          )}
          {step === 3 && <ReadyStep city={city} role={role} name={name} />}

          <Footer
            step={step}
            total={total}
            onBack={back}
            onNext={() => {
              if (step === total - 1) navigate({ to: "/dashboard" });
              else next();
            }}
          />
        </main>

        <PreviewPanel step={step} city={city} role={role} agents={agents} />
      </div>
    </div>
  );
}

/* ============================================================
   STEPS
   ============================================================ */
function WelcomeStep({
  name,
  setName,
  email,
  setEmail,
  role,
  setRole,
}: {
  name: string;
  setName: (s: string) => void;
  email: string;
  setEmail: (s: string) => void;
  role: Role;
  setRole: (r: Role) => void;
}) {
  const roles: { id: Role; label: string; desc: string; icon: typeof ShieldCheck }[] = [
    {
      id: "incident_commander",
      label: "Incident commander",
      desc: "Owns the response. Can pause or override agents.",
      icon: ShieldCheck,
    },
    {
      id: "dispatcher",
      label: "Dispatcher",
      desc: "Routes units across radio, SMS and traffic APIs.",
      icon: Radar,
    },
    {
      id: "city_official",
      label: "City official",
      desc: "Reviews outcomes and after-action briefs.",
      icon: Users,
    },
    {
      id: "analyst",
      label: "Analyst",
      desc: "Audits reasoning traces and trust profiles.",
      icon: Brain,
    },
  ];
  return (
    <section className="space-y-7 animate-rise">
      <Kicker>Step 01 · Identity</Kicker>
      <Title>Let's set up your console.</Title>
      <Subtitle>A few details so the agent mesh knows who you are and where to escalate.</Subtitle>

      <div className="surface p-5 space-y-4">
        <Field label="Full name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tim Operative"
            className="w-full surface-input rounded-md px-3 py-2 text-[13.5px] focus:outline-none"
          />
        </Field>
        <Field label="Work email">
          <div className="relative">
            <Mail className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-tertiary" />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@sentinel.ai"
              className="w-full surface-input rounded-md pl-8 pr-3 py-2 text-[13.5px] focus:outline-none"
            />
          </div>
        </Field>
        <Field label="Role">
          <div className="grid sm:grid-cols-2 gap-2">
            {roles.map((r) => {
              const active = role === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={`text-left rounded-md p-3 border transition flex items-start gap-3 ${
                    active
                      ? "border-accent-cyan/40 bg-accent-cyan-soft"
                      : "border-line bg-surface-2 hover:border-line-strong"
                  }`}
                >
                  <r.icon className="h-3.5 w-3.5 mt-0.5 text-text-secondary shrink-0" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{r.label}</div>
                    <div className="text-[11.5px] text-text-tertiary mt-0.5">{r.desc}</div>
                  </div>
                  {active && <CheckCircle2 className="h-3.5 w-3.5 text-accent-cyan ml-auto shrink-0" />}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </section>
  );
}

function CityStep({ city, setCity }: { city: string; setCity: (c: string) => void }) {
  return (
    <section className="space-y-7 animate-rise">
      <Kicker>Step 02 · City</Kicker>
      <Title>Pick the city you'll command.</Title>
      <Subtitle>Sentinel will watch only the signals and sensors tagged to this geography.</Subtitle>

      <div className="surface p-4">
        <div className="grid sm:grid-cols-2 gap-2">
          {CITIES.map((c) => {
            const active = city === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCity(c.id)}
                className={`text-left rounded-md p-4 border transition ${
                  active
                    ? "border-accent-cyan/40 bg-accent-cyan-soft"
                    : "border-line bg-surface-2 hover:border-line-strong"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-display text-[16px] font-semibold tracking-tight">{c.name}</div>
                    <div className="text-[11px] text-text-tertiary font-mono">
                      {c.country} · pop {c.pop}
                    </div>
                  </div>
                  <span className="font-mono text-[10.5px] text-text-tertiary">
                    {c.lat.toFixed(2)}°N {c.lng.toFixed(2)}°E
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`pill ${active ? "pill-ok" : "pill-muted"}`}>
                    {active ? "Selected" : "Ready"}
                  </span>
                  <span className="label-eyebrow">density · {c.density}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function NotificationStep({
  prefs,
  setPrefs,
  agents,
  setAgents,
}: {
  prefs: { critical: boolean; high: boolean; medium: boolean; lowRedraft: boolean };
  setPrefs: (p: NotificationStepProps["prefs"]) => void;
  agents: Record<string, boolean>;
  setAgents: (a: Record<string, boolean>) => void;
}) {
  const tog = (k: keyof typeof prefs) => setPrefs({ ...prefs, [k]: !prefs[k] });
  return (
    <section className="space-y-7 animate-rise">
      <Kicker>Step 03 · Signals</Kicker>
      <Title>How loud should Sentinel be?</Title>
      <Subtitle>Pick what wakes you up. You can change this anytime.</Subtitle>

      <div className="surface p-5">
        <div className="label-eyebrow">Severity push</div>
        <div className="mt-3 space-y-1.5">
          <TogRow
            label="Critical incidents · always"
            desc="Floods, MVCs, infrastructure failure."
            on={prefs.critical}
            onChange={() => tog("critical")}
          />
          <TogRow
            label="High incidents"
            desc="Heatwaves, blockages, power events."
            on={prefs.high}
            onChange={() => tog("high")}
          />
          <TogRow
            label="Medium watch list"
            desc="Drift signals before they escalate."
            on={prefs.medium}
            onChange={() => tog("medium")}
          />
          <TogRow
            label="Plan re-drafts"
            desc="When Adaptation issues plan v2 / v3."
            on={prefs.lowRedraft}
            onChange={() => tog("lowRedraft")}
          />
        </div>
      </div>

      <div className="surface p-5">
        <div className="label-eyebrow">Active agents</div>
        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          {AGENT_ORDER.map((k) => {
            const a = AGENTS[k];
            const on = agents[k];
            return (
              <button
                key={k}
                onClick={() => setAgents({ ...agents, [k]: !on })}
                className={`rounded-md p-3 border flex items-center gap-3 transition ${
                  on
                    ? "border-accent-cyan/40 bg-accent-cyan-soft"
                    : "border-line bg-surface-2 hover:border-line-strong"
                }`}
              >
                <a.icon className="h-3.5 w-3.5 text-text-secondary shrink-0" strokeWidth={1.75} />
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-[13px] font-medium truncate">{a.name}</div>
                  <div className="label-eyebrow">{a.code}</div>
                </div>
                <span className={`pill ${on ? "pill-ok" : "pill-muted"}`}>{on ? "On" : "Off"}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
type NotificationStepProps = Parameters<typeof NotificationStep>[0];

function ReadyStep({ city, role, name }: { city: string; role: Role; name: string }) {
  const c = CITIES.find((x) => x.id === city) ?? CITIES[0];
  return (
    <section className="space-y-7 animate-rise">
      <Kicker>Step 04 · Ready</Kicker>
      <Title>You're ready. The mesh is online.</Title>
      <Subtitle>
        Sentinel has spun up a private operations channel for{" "}
        <span className="text-text-primary">{c.name}</span>
        {name ? (
          <>
            {" with "}
            <span className="text-text-primary">{name}</span>
          </>
        ) : null}{" "}
        as <span className="text-accent-cyan">{role.replace("_", " ")}</span>.
      </Subtitle>

      <div className="surface p-6">
        <OrchestrationGraph activeIndex={5} compact />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <StatRow label="City" value={c.name} />
          <StatRow label="Population" value={c.pop} />
          <StatRow label="Agents" value="6 / 6" />
          <StatRow label="Trust floor" value="0.71" />
        </div>
      </div>

      <div className="surface p-5 flex items-center gap-3">
        <Lock className="h-4 w-4 text-status-ok shrink-0" strokeWidth={1.75} />
        <p className="text-[12.5px] text-text-secondary">
          Audit-grade reasoning logs are encrypted at rest. Every override you make will be signed and
          timestamped.
        </p>
      </div>
    </section>
  );
}

/* ============================================================
   PREVIEW
   ============================================================ */
function PreviewPanel({
  step,
  city,
  role,
  agents,
}: {
  step: number;
  city: string;
  role: Role;
  agents: Record<string, boolean>;
}) {
  const c = useMemo(() => CITIES.find((x) => x.id === city) ?? CITIES[0], [city]);
  return (
    <aside className="space-y-4 lg:sticky lg:top-24 self-start">
      <div className="surface p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="label-eyebrow">Sector preview</span>
          <StatusPill state="online" label="Live" />
        </div>
        <div className="flex justify-center py-3">
          <RadarDisplay size={200} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center">
          <div className="surface-input rounded-md p-2.5">
            <div className="label-eyebrow">City</div>
            <div className="mt-0.5 text-[12.5px] font-medium">{c.name}</div>
          </div>
          <div className="surface-input rounded-md p-2.5">
            <div className="label-eyebrow">Coordinates</div>
            <div className="mt-0.5 font-mono text-[11px]">
              {c.lat.toFixed(2)}°N {c.lng.toFixed(2)}°E
            </div>
          </div>
        </div>
      </div>

      <div className="surface p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="label-eyebrow">Agent allocation</span>
          <span className="font-mono text-[10.5px] text-accent-cyan">
            {Object.values(agents).filter(Boolean).length} / 6
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {AGENT_ORDER.map((k) => {
            const a = AGENTS[k];
            const on = agents[k];
            return (
              <div
                key={k}
                className={`aspect-square rounded-md flex items-center justify-center border ${
                  on
                    ? "border-accent-cyan/40 bg-accent-cyan-soft"
                    : "border-line bg-surface-2 opacity-50"
                }`}
              >
                <a.icon className="h-3 w-3 text-text-secondary" strokeWidth={1.75} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="surface p-5">
        <div className="label-eyebrow">Onboarding</div>
        <ul className="mt-2 space-y-1.5 text-[12px]">
          <Bullet active={step >= 0}>Identity confirmed</Bullet>
          <Bullet active={step >= 1}>City scope · {c.name}</Bullet>
          <Bullet active={step >= 2}>Push severity tuned</Bullet>
          <Bullet active={step >= 3}>Operations channel keyed</Bullet>
        </ul>
        <div className="mt-3 text-[11px] text-text-tertiary">
          Role: <span className="text-text-secondary">{role.replace("_", " ")}</span>
        </div>
      </div>
    </aside>
  );
}

/* ============================================================
   HELPERS
   ============================================================ */
function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="label-eyebrow">// {children}</div>;
}
function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-[36px] md:text-[48px] font-semibold tracking-[-0.03em] leading-[1.05]">
      {children}
    </h1>
  );
}
function Subtitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] text-text-secondary max-w-xl leading-relaxed">{children}</p>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-eyebrow">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
function TogRow({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="w-full surface-input rounded-md p-3 flex items-center gap-3 text-left hover:border-line-strong transition"
    >
      <Bell className={`h-3.5 w-3.5 ${on ? "text-accent-cyan" : "text-text-tertiary"}`} strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium">{label}</div>
        <div className="text-[11px] text-text-tertiary">{desc}</div>
      </div>
      <span
        className={`relative inline-flex h-5 w-9 rounded-full transition ${
          on ? "bg-accent-cyan/30" : "bg-surface-3"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform ${
            on ? "translate-x-4 bg-accent-cyan" : "bg-text-secondary"
          }`}
        />
      </span>
    </button>
  );
}
function Bullet({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <li
      className={`flex items-center gap-2 ${
        active ? "text-text-primary" : "text-text-tertiary"
      }`}
    >
      {active ? (
        <CheckCircle2 className="h-3 w-3 text-accent-cyan" strokeWidth={2} />
      ) : (
        <ChevronRight className="h-3 w-3" />
      )}
      <span>{children}</span>
    </li>
  );
}
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-input rounded-md p-2.5">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-0.5 text-[12.5px] font-medium">{value}</div>
    </div>
  );
}

/* ============================================================
   HEADER / FOOTER
   ============================================================ */
function Header({ step, total }: { step: number; total: number }) {
  const pct = ((step + 1) / total) * 100;
  return (
    <header className="sticky top-0 z-40 bg-surface-0/90 backdrop-blur-md border-b border-line">
      <div className="mx-auto max-w-5xl px-5 lg:px-8 h-14 flex items-center justify-between">
        <SentinelMark />
        <div className="hidden sm:flex items-center gap-3 flex-1 mx-8 max-w-md">
          <div className="flex-1 confidence-track">
            <div className="confidence-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-[10.5px] text-text-tertiary">
            {String(step + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
        </div>
        <Link to="/dashboard" className="btn-ghost text-[12.5px] hidden sm:inline-flex">
          Go to console <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}

function Footer({
  step,
  total,
  onBack,
  onNext,
}: {
  step: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const isLast = step === total - 1;
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        onClick={onBack}
        disabled={step === 0}
        className="btn-ghost disabled:opacity-40 text-[13px]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>
      <button onClick={onNext} className="btn-primary text-[13px]">
        {isLast ? (
          <>
            <Sparkles className="h-3.5 w-3.5" /> Enter console
          </>
        ) : (
          <>
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </>
        )}
      </button>
    </div>
  );
}
