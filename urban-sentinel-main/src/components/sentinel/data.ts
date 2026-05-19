import type { AgentKey } from "./primitives";

/* ============================================================
   SCENARIOS — full domain data for the dashboard mission control
   ============================================================ */
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type Scenario = {
  id: string;
  emoji: string;
  label: string;
  placeholder: string;
  city: string;
};

export const SCENARIOS: Scenario[] = [
  {
    id: "flood",
    emoji: "🌊",
    label: "Urban Flooding",
    placeholder: "Saddar mein paani bhar gaya, traffic jam hai.",
    city: "Karachi",
  },
  {
    id: "heat",
    emoji: "🔥",
    label: "Heatwave",
    placeholder: "46°C in Multan, hospital admissions rising.",
    city: "Multan",
  },
  {
    id: "accident",
    emoji: "🚗",
    label: "Multi-Vehicle Collision",
    placeholder: "5-vehicle pileup blocking 3 lanes on Shahrah-e-Faisal.",
    city: "Karachi",
  },
  {
    id: "block",
    emoji: "🚧",
    label: "Road Blockage",
    placeholder: "Mall Road blocked due to protest convergence.",
    city: "Lahore",
  },
  {
    id: "infra",
    emoji: "⚡",
    label: "Infrastructure Failure",
    placeholder: "11kV feeder trip in DHA Phase 6, 12,000 households affected.",
    city: "Karachi",
  },
];

export type TraceStep = {
  agent: AgentKey;
  agentName: string;
  step: number;
  ms: number;
  input: string;
  reasoning: string;
  output: string;
  tools: string[];
  confidence: number;
};

export type Action = {
  p: number;
  action: string;
  assignee: string;
  impact: string;
  channel: string;
  eta: string;
  status: "queued" | "dispatched" | "ack" | "complete";
};

export type Result = {
  id: string;
  scenarioId: string;
  scenarioLabel: string;
  ts: string;
  city: string;
  detection: {
    type: string;
    location: string;
    confidence: number;
    severity: Severity;
    description: string;
    coordinates: { lat: number; lng: number };
    signalCount: number;
  };
  impact: {
    summary: string;
    bullets: string[];
    people: string;
    time: string;
    infra: string;
    economic: string;
  };
  actions: {
    coord: string;
    items: Action[];
  };
  sim: {
    before: { congestion: string; speed: string; status: string; raw: number };
    after: { congestion: string; speed: string; status: string; raw: number };
    log: { ticket: string; text: string; ts: string }[];
    monteCarloRuns: number;
  };
  outcome: string;
  kpis: { mobility: number; safety: number; equity: number; composite: number };
  trace: TraceStep[];
  failures?: { signal: string; resolution: string }[];
};

const baseStep = (agent: AgentKey, name: string): Partial<TraceStep> => ({
  agent,
  agentName: name,
});

export const RESULTS: Record<string, Omit<Result, "id" | "ts" | "scenarioLabel">> = {
  flood: {
    scenarioId: "flood",
    city: "Karachi",
    detection: {
      type: "Urban Flooding",
      location: "Saddar, Karachi",
      confidence: 0.92,
      severity: "CRITICAL",
      description:
        "Monsoon cell combined with blocked stormwater drains has produced waist-deep flooding across 4 intersections in Saddar. Cross-source agreement from 218 social posts, weather radar and rapid-bus telemetry.",
      coordinates: { lat: 24.86, lng: 67.01 },
      signalCount: 218,
    },
    impact: {
      summary:
        "Mobility collapse expected for 4–6 hours; risk of submerged vehicles and cascading power faults.",
      bullets: [
        "Major arteries (II Chundrigar, Shahrah-e-Faisal feeder) at standstill",
        "2 hospitals reporting access difficulty for ambulances",
        "Low-lying neighborhoods at risk of indoor flooding",
      ],
      people: "~180,000",
      time: "Next 6 hrs",
      infra: "High",
      economic: "PKR 312M projected loss",
    },
    actions: {
      coord:
        "Coordinated dispatch across NDMA, Karachi Metropolitan, and Rescue 1122 on a unified channel.",
      items: [
        {
          p: 1,
          action: "Deploy 6 dewatering pumps to II Chundrigar & Saddar interchange",
          assignee: "KMC Drainage",
          impact: "−45% standing water in 90 min",
          channel: "RADIO_DISPATCH",
          eta: "T+08 min",
          status: "dispatched",
        },
        {
          p: 2,
          action: "Reroute inbound traffic via Sharae Quaideen and Numaish",
          assignee: "Traffic Police",
          impact: "Restores 38 km/h avg flow",
          channel: "TRAFFIC_API",
          eta: "T+02 min",
          status: "ack",
        },
        {
          p: 3,
          action: "Push Urdu/English emergency advisory to affected cells",
          assignee: "PTA Cell Broadcast",
          impact: "Reaches 1.2M devices",
          channel: "SMS_BROADCAST",
          eta: "T+01 min",
          status: "complete",
        },
        {
          p: 4,
          action: "Pre-position 4 ambulances at Civil Hospital and JPMC",
          assignee: "Rescue 1122",
          impact: "ETA cut from 14→6 min",
          channel: "DISPATCH",
          eta: "T+12 min",
          status: "dispatched",
        },
        {
          p: 5,
          action: "Open emergency shelter at Frere Hall basement-free wing",
          assignee: "Civil Defence",
          impact: "Capacity 500",
          channel: "RESOURCE",
          eta: "T+22 min",
          status: "queued",
        },
      ],
    },
    sim: {
      before: { congestion: "9.2 / 10", speed: "4 km/h", status: "CRISIS_UNMANAGED", raw: 92 },
      after: { congestion: "3.1 / 10", speed: "38 km/h", status: "CRISIS_MANAGED", raw: 31 },
      log: [
        { ticket: "TKT-48211", text: "Pumps deployed → standing water reduced 43% in 88 min.", ts: "+88m" },
        { ticket: "TKT-48212", text: "Reroute live → arterial throughput restored to 78% baseline.", ts: "+12m" },
        { ticket: "TKT-48213", text: "Cell broadcast delivered to 1.18M devices, opt-out 0.4%.", ts: "+02m" },
        { ticket: "TKT-48214", text: "Ambulance pre-position complete; 3 calls served at median 6.2 min.", ts: "+18m" },
      ],
      monteCarloRuns: 1000,
    },
    outcome:
      "Plan converges to CRISIS_MANAGED state in T+92 min. Net displaced trips: 41k. Estimated avoided economic loss: PKR 312M. No fatalities recorded in simulated window.",
    kpis: { mobility: 0.88, safety: 0.91, equity: 0.83, composite: 0.87 },
    trace: [
      {
        ...(baseStep("scout", "Scout Agent") as TraceStep),
        step: 1,
        ms: 412,
        input: "scenario=flood",
        reasoning: "Polled 4 sources; deduped 1,284 → 218 unique signals; geocoded 91%.",
        output: "218 signals; cluster centroid: 24.86°N 67.01°E",
        tools: ["twitter.search", "weather.radar", "traffic.feed", "geo.cluster"],
        confidence: 0.94,
      },
      {
        ...(baseStep("verification", "Verification Agent") as TraceStep),
        step: 2,
        ms: 560,
        input: "218 signals",
        reasoning: "Cross-source corroboration: 3+ independent sources agree on geography & severity.",
        output: "Trust score 0.91; suppressed 12 contradictory posts.",
        tools: ["verify.crosscheck", "trust.score"],
        confidence: 0.91,
      },
      {
        ...(baseStep("decision", "Decision Agent") as TraceStep),
        step: 3,
        ms: 1120,
        input: "verified cluster",
        reasoning:
          "k-means + LLM classifier; flood class p=0.92, accident p=0.06. Selected 5 actions maximizing coverage / cost ratio under SLA constraints.",
        output: "Crisis=Urban Flooding, severity=CRITICAL — 5 prioritized actions",
        tools: ["llm.classify", "planner.optim"],
        confidence: 0.92,
      },
      {
        ...(baseStep("execution", "Execution Agent") as TraceStep),
        step: 4,
        ms: 740,
        input: "5 action plan",
        reasoning: "Routed actions to channels (radio, traffic API, SMS broadcast, dispatch).",
        output: "5 actions dispatched; 4 acked within SLA.",
        tools: ["dispatch.radio", "sms.broadcast", "traffic.api"],
        confidence: 0.96,
      },
      {
        ...(baseStep("monitoring", "Monitoring Agent") as TraceStep),
        step: 5,
        ms: 1740,
        input: "live telemetry",
        reasoning: "Ran 1,000 Monte Carlo trials on traffic + drainage models against streaming sensors.",
        output: "P50 outcome: CRISIS_MANAGED at T+92m; composite KPI 0.87.",
        tools: ["sim.traffic", "sim.drainage", "kpi.score"],
        confidence: 0.87,
      },
      {
        ...(baseStep("adaptation", "Adaptation Agent") as TraceStep),
        step: 6,
        ms: 380,
        input: "drift signal: rainfall +18%",
        reasoning: "Updated dewatering capacity allocation; re-issued reroute through Tower Rd.",
        output: "Plan v2 broadcast to 3 channels; no rollback required.",
        tools: ["learn.update", "plan.revise"],
        confidence: 0.89,
      },
    ],
    failures: [
      {
        signal: "Conflicting depth readings between citizen reports and ultrasonic sensor 4F-12",
        resolution: "Verification Agent lowered trust on sensor 4F-12, requested cross-check from Rescue 1122 ground unit.",
      },
    ],
  },
  heat: {
    scenarioId: "heat",
    city: "Multan",
    detection: {
      type: "Heatwave",
      location: "Multan Metro",
      confidence: 0.88,
      severity: "HIGH",
      description:
        "Sustained 46°C with low humidity and night-time minimums above 32°C. Heatstroke admissions up 38%.",
      coordinates: { lat: 30.16, lng: 71.5 },
      signalCount: 94,
    },
    impact: {
      summary: "Vulnerable populations face acute risk over the next 72 hours.",
      bullets: [
        "Outdoor workers exposed during 11:00–17:00",
        "Power demand peaks risk grid stress",
        "Water tanker demand expected to spike 2x",
      ],
      people: "~620,000",
      time: "Next 72 hrs",
      infra: "Medium",
      economic: "PKR 88M projected loss",
    },
    actions: {
      coord: "Joint protocol: Health Dept, WAPDA, Civil Defence on a single command channel.",
      items: [
        { p: 1, action: "Open 24 cooling centres in mosques and schools", assignee: "Civil Defence", impact: "Capacity 12,000", channel: "RESOURCE", eta: "T+25 min", status: "dispatched" },
        { p: 2, action: "Deploy hydration kiosks at 40 high-traffic intersections", assignee: "Rescue 1122", impact: "200k servings/day", channel: "DISPATCH", eta: "T+38 min", status: "queued" },
        { p: 3, action: "Issue worker advisory to halt outdoor labor 12:00–16:00", assignee: "Labor Dept", impact: "−35% heatstroke ER load", channel: "SMS_BROADCAST", eta: "T+04 min", status: "complete" },
        { p: 4, action: "Pre-stage 8 ambulances at high-density zones", assignee: "Rescue 1122", impact: "ETA cut to 7 min", channel: "DISPATCH", eta: "T+15 min", status: "ack" },
      ],
    },
    sim: {
      before: { congestion: "ER load 7.8/10", speed: "wait 92m", status: "STRESS_RISING", raw: 78 },
      after: { congestion: "ER load 4.1/10", speed: "wait 28m", status: "STABILIZED", raw: 41 },
      log: [
        { ticket: "TKT-50112", text: "Cooling centres operational; foot traffic 9,400 in first 8h.", ts: "+8h" },
        { ticket: "TKT-50113", text: "Hydration kiosks served 184k cups Day 1.", ts: "+24h" },
        { ticket: "TKT-50114", text: "Worker advisory broadcast; estimated −35% outdoor exposure.", ts: "+04m" },
      ],
      monteCarloRuns: 1000,
    },
    outcome: "Heat-related ER admissions projected to plateau within 36 hours. Composite outcome score 0.81.",
    kpis: { mobility: 0.74, safety: 0.85, equity: 0.84, composite: 0.81 },
    trace: [
      { ...(baseStep("scout", "Scout Agent") as TraceStep), step: 1, ms: 320, input: "scenario=heat", reasoning: "Pulled weather, hospital and grid telemetry.", output: "94 signals", tools: ["weather.now", "hospital.api"], confidence: 0.92 },
      { ...(baseStep("verification", "Verification Agent") as TraceStep), step: 2, ms: 340, input: "94 signals", reasoning: "Hospital admission deltas corroborate weather feed.", output: "Trust 0.90", tools: ["verify.crosscheck"], confidence: 0.90 },
      { ...(baseStep("decision", "Decision Agent") as TraceStep), step: 3, ms: 720, input: "verified cluster", reasoning: "Heatwave class p=0.88; selected 4 high-coverage actions.", output: "Crisis=Heatwave, 4 actions", tools: ["llm.classify", "planner.optim"], confidence: 0.88 },
      { ...(baseStep("execution", "Execution Agent") as TraceStep), step: 4, ms: 520, input: "4 action plan", reasoning: "Routed to SMS broadcast + resource dispatch.", output: "4 actions dispatched", tools: ["sms.broadcast", "dispatch.radio"], confidence: 0.93 },
      { ...(baseStep("monitoring", "Monitoring Agent") as TraceStep), step: 5, ms: 1520, input: "telemetry", reasoning: "Modeled ER load + hydration coverage.", output: "STABILIZED at T+36h", tools: ["sim.health"], confidence: 0.81 },
      { ...(baseStep("adaptation", "Adaptation Agent") as TraceStep), step: 6, ms: 290, input: "drift: grid stress +9%", reasoning: "Suggested temporary load-shed plan.", output: "Plan v2 escalated to WAPDA", tools: ["learn.update"], confidence: 0.84 },
    ],
    failures: [
      { signal: "Sensor cluster offline at Multan Cantt (3 sensors)", resolution: "Switched to satellite thermal proxy; trust degraded 0.94 → 0.81." },
    ],
  },
  accident: {
    scenarioId: "accident",
    city: "Karachi",
    detection: {
      type: "Multi-vehicle Collision",
      location: "Shahrah-e-Faisal, Karachi",
      confidence: 0.95,
      severity: "HIGH",
      description: "5-vehicle pileup blocking 3 inbound lanes near Nursery flyover.",
      coordinates: { lat: 24.86, lng: 67.07 },
      signalCount: 47,
    },
    impact: {
      summary: "Inbound corridor capacity cut by ~70% for next 90 minutes.",
      bullets: ["Ambulance ETA degraded to 14 min", "Spillback into Karsaz and Drigh Road", "Risk of secondary collisions"],
      people: "~85,000 commuters",
      time: "Next 90 min",
      infra: "Low",
      economic: "PKR 64M projected loss",
    },
    actions: {
      coord: "Single incident commander assigned. Traffic, Rescue, and Tow on shared channel.",
      items: [
        { p: 1, action: "Dispatch 3 ambulances + 1 heavy rescue from Karsaz station", assignee: "Rescue 1122", impact: "On-scene in 6 min", channel: "DISPATCH", eta: "T+02 min", status: "complete" },
        { p: 2, action: "Activate contraflow on outbound shoulder", assignee: "Traffic Police", impact: "+1 lane capacity", channel: "TRAFFIC_API", eta: "T+05 min", status: "ack" },
        { p: 3, action: "Push live reroute to navigation apps via API", assignee: "Comms", impact: "−30% inbound demand", channel: "API", eta: "T+01 min", status: "complete" },
        { p: 4, action: "Pre-stage 2 tow trucks at SITE depot", assignee: "Highway Authority", impact: "Clearance time cut to 35m", channel: "DISPATCH", eta: "T+08 min", status: "dispatched" },
      ],
    },
    sim: {
      before: { congestion: "8.7 / 10", speed: "6 km/h", status: "CRISIS_UNMANAGED", raw: 87 },
      after: { congestion: "3.6 / 10", speed: "32 km/h", status: "CRISIS_MANAGED", raw: 36 },
      log: [
        { ticket: "TKT-72005", text: "Rescue on-scene at 6m12s; 4 patients triaged.", ts: "+06m" },
        { ticket: "TKT-72006", text: "Contraflow active; throughput restored to 71% baseline.", ts: "+09m" },
        { ticket: "TKT-72007", text: "Reroute API push reached 412k sessions.", ts: "+03m" },
      ],
      monteCarloRuns: 1000,
    },
    outcome: "Lane clearance achieved in T+34 min. No secondary collisions in simulated window.",
    kpis: { mobility: 0.90, safety: 0.89, equity: 0.86, composite: 0.89 },
    trace: [
      { ...(baseStep("scout", "Scout Agent") as TraceStep), step: 1, ms: 220, input: "scenario=accident", reasoning: "Pulled traffic camera + citizen reports.", output: "47 signals", tools: ["traffic.cam", "twitter.search"], confidence: 0.97 },
      { ...(baseStep("verification", "Verification Agent") as TraceStep), step: 2, ms: 210, input: "47 signals", reasoning: "Camera frames confirm 5-vehicle blocking.", output: "Trust 0.95", tools: ["vision.classify"], confidence: 0.95 },
      { ...(baseStep("decision", "Decision Agent") as TraceStep), step: 3, ms: 410, input: "verified", reasoning: "Accident class p=0.95; 4 fast-clearance actions.", output: "Crisis=MVC, 4 actions", tools: ["llm.classify", "planner.optim"], confidence: 0.95 },
      { ...(baseStep("execution", "Execution Agent") as TraceStep), step: 4, ms: 380, input: "4 plan", reasoning: "Dispatch to rescue + traffic API.", output: "4 actions sent", tools: ["dispatch.radio", "traffic.api"], confidence: 0.96 },
      { ...(baseStep("monitoring", "Monitoring Agent") as TraceStep), step: 5, ms: 1180, input: "telemetry", reasoning: "Microsim of corridor + dispatch.", output: "CRISIS_MANAGED at T+34m", tools: ["sim.traffic"], confidence: 0.89 },
      { ...(baseStep("adaptation", "Adaptation Agent") as TraceStep), step: 6, ms: 240, input: "post-incident", reasoning: "Logged lessons; updated dispatch priors at Karsaz station.", output: "Memory updated", tools: ["learn.update"], confidence: 0.91 },
    ],
  },
  block: {
    scenarioId: "block",
    city: "Lahore",
    detection: {
      type: "Road Blockage",
      location: "Mall Road, Lahore",
      confidence: 0.84,
      severity: "MEDIUM",
      description: "Convergence of two protest groups blocking Mall Road between Charing Cross and Regal Chowk.",
      coordinates: { lat: 31.55, lng: 74.34 },
      signalCount: 52,
    },
    impact: {
      summary: "Lahore east-west corridor capacity reduced; rapid bus disrupted.",
      bullets: ["Metro bus delays of 12–18 min", "Office commute spillover into Jail Road", "Hospital access via Mayo Hospital strained"],
      people: "~140,000",
      time: "Next 4 hrs",
      infra: "Low",
      economic: "PKR 41M projected loss",
    },
    actions: {
      coord: "City admin + Traffic Police coordinating with rapid-bus authority.",
      items: [
        { p: 1, action: "Reroute traffic via Jail Road and Davis Road", assignee: "Traffic Police", impact: "Restores 60% baseline flow", channel: "TRAFFIC_API", eta: "T+06 min", status: "ack" },
        { p: 2, action: "Adjust metro bus to Ferozepur Rd loop", assignee: "Punjab Mass Transit", impact: "Recovers 80% schedule", channel: "API", eta: "T+12 min", status: "dispatched" },
        { p: 3, action: "Notify commuters via SMS + nav APIs", assignee: "Comms", impact: "−25% inbound demand", channel: "SMS_BROADCAST", eta: "T+02 min", status: "complete" },
      ],
    },
    sim: {
      before: { congestion: "7.4 / 10", speed: "9 km/h", status: "DEGRADED", raw: 74 },
      after: { congestion: "3.9 / 10", speed: "28 km/h", status: "STABILIZED", raw: 39 },
      log: [
        { ticket: "TKT-31108", text: "Reroute live; arterial throughput restored to 64% baseline.", ts: "+11m" },
        { ticket: "TKT-31109", text: "Metro bus loop active; on-time performance 78%.", ts: "+14m" },
      ],
      monteCarloRuns: 1000,
    },
    outcome: "Corridor stabilized in T+45 min without escalation. Composite KPI 0.78.",
    kpis: { mobility: 0.79, safety: 0.81, equity: 0.74, composite: 0.78 },
    trace: [
      { ...(baseStep("scout", "Scout Agent") as TraceStep), step: 1, ms: 260, input: "scenario=block", reasoning: "Citizen + traffic feeds.", output: "52 signals", tools: ["twitter.search", "traffic.feed"], confidence: 0.86 },
      { ...(baseStep("verification", "Verification Agent") as TraceStep), step: 2, ms: 220, input: "52 signals", reasoning: "Multi-source agreement at Charing Cross.", output: "Trust 0.86", tools: ["verify.crosscheck"], confidence: 0.86 },
      { ...(baseStep("decision", "Decision Agent") as TraceStep), step: 3, ms: 380, input: "verified", reasoning: "Blockage class p=0.84; 3 actions selected.", output: "Crisis=Blockage, 3 actions", tools: ["llm.classify", "planner.optim"], confidence: 0.84 },
      { ...(baseStep("execution", "Execution Agent") as TraceStep), step: 4, ms: 290, input: "3 plan", reasoning: "Routed to traffic + transit APIs.", output: "3 actions dispatched", tools: ["traffic.api", "transit.api"], confidence: 0.92 },
      { ...(baseStep("monitoring", "Monitoring Agent") as TraceStep), step: 5, ms: 980, input: "telemetry", reasoning: "Network reassignment.", output: "STABILIZED at T+45m", tools: ["sim.traffic"], confidence: 0.81 },
      { ...(baseStep("adaptation", "Adaptation Agent") as TraceStep), step: 6, ms: 210, input: "drift signal", reasoning: "Adjusted reroute weights for evening rush.", output: "Plan v2 broadcast", tools: ["learn.update"], confidence: 0.83 },
    ],
  },
  infra: {
    scenarioId: "infra",
    city: "Karachi",
    detection: {
      type: "Power Failure",
      location: "DHA Phase 6, Karachi",
      confidence: 0.9,
      severity: "HIGH",
      description: "11kV feeder trip cutting power to 12,000 households; water pumping affected for 38 buildings.",
      coordinates: { lat: 24.79, lng: 67.04 },
      signalCount: 73,
    },
    impact: {
      summary: "Sustained outage will cascade into water shortages within 4 hours.",
      bullets: ["Cold storage at 6 pharmacies at risk", "Lifts in 12 high-rises out of service", "Water pressure drop in 38 buildings"],
      people: "~52,000",
      time: "Next 6 hrs",
      infra: "High",
      economic: "PKR 124M projected loss",
    },
    actions: {
      coord: "K-Electric, KW&SB, and Civil Defence coordinating on shared incident channel.",
      items: [
        { p: 1, action: "Reroute load via parallel 11kV feeder", assignee: "K-Electric", impact: "Restores 70% within 30m", channel: "GRID_SCADA", eta: "T+04 min", status: "dispatched" },
        { p: 2, action: "Dispatch water bowsers to 38 buildings", assignee: "KW&SB", impact: "Buys 8h buffer", channel: "DISPATCH", eta: "T+18 min", status: "ack" },
        { p: 3, action: "Pharmacy cold-chain mobile units on standby", assignee: "Health Dept", impact: "Saves PKR 12M inventory", channel: "DISPATCH", eta: "T+25 min", status: "queued" },
        { p: 4, action: "Building managers notified of lift status", assignee: "Comms", impact: "Reduces stranded calls 80%", channel: "SMS_BROADCAST", eta: "T+02 min", status: "complete" },
      ],
    },
    sim: {
      before: { congestion: "Outage 100%", speed: "ETA 6h", status: "OUTAGE_CASCADING", raw: 100 },
      after: { congestion: "Outage 12%", speed: "ETA 38m", status: "RECOVERED", raw: 12 },
      log: [
        { ticket: "TKT-90031", text: "Feeder reroute energized; 9,800 households restored.", ts: "+28m" },
        { ticket: "TKT-90032", text: "Bowsers delivered 142 kL across 38 buildings.", ts: "+44m" },
        { ticket: "TKT-90033", text: "Cold-chain units deployed to 6 pharmacies.", ts: "+32m" },
      ],
      monteCarloRuns: 1000,
    },
    outcome: "Full restoration projected within 38 minutes. Composite KPI 0.84.",
    kpis: { mobility: 0.80, safety: 0.86, equity: 0.85, composite: 0.84 },
    trace: [
      { ...(baseStep("scout", "Scout Agent") as TraceStep), step: 1, ms: 290, input: "scenario=infra", reasoning: "Grid telemetry + complaints.", output: "73 signals", tools: ["grid.scada", "twitter.search"], confidence: 0.93 },
      { ...(baseStep("verification", "Verification Agent") as TraceStep), step: 2, ms: 250, input: "73 signals", reasoning: "SCADA telemetry confirms feeder trip.", output: "Trust 0.94", tools: ["verify.crosscheck"], confidence: 0.94 },
      { ...(baseStep("decision", "Decision Agent") as TraceStep), step: 3, ms: 460, input: "verified", reasoning: "Feeder trip pattern, p=0.90; 4 actions optimizing time-to-restore.", output: "Crisis=Power Failure, 4 actions", tools: ["llm.classify", "planner.optim"], confidence: 0.90 },
      { ...(baseStep("execution", "Execution Agent") as TraceStep), step: 4, ms: 420, input: "4 plan", reasoning: "Routed to SCADA + dispatch.", output: "4 actions dispatched", tools: ["grid.scada", "dispatch.radio"], confidence: 0.94 },
      { ...(baseStep("monitoring", "Monitoring Agent") as TraceStep), step: 5, ms: 1320, input: "telemetry", reasoning: "Grid + logistics simulation.", output: "RECOVERED at T+38m", tools: ["sim.grid"], confidence: 0.84 },
      { ...(baseStep("adaptation", "Adaptation Agent") as TraceStep), step: 6, ms: 270, input: "drift signal", reasoning: "Updated cascade priors for water pumping.", output: "Memory updated", tools: ["learn.update"], confidence: 0.87 },
    ],
    failures: [
      { signal: "SCADA reading stale > 90s", resolution: "Switched to secondary RTU; lowered trust until ack from substation B-14." },
    ],
  },
};

/* ============================================================
   LIVE SIGNAL POOL — for hero + dashboard ticker
   ============================================================ */
export const LIVE_SIGNALS = [
  { src: "Twitter",     color: "rgb(99, 102, 241)", text: "Saddar mein paani bhar gaya hai, traffic completely jam.", geo: "24.86°N 67.01°E" },
  { src: "Weather",     color: "rgb(251, 191, 36)", text: "Heat advisory: 46°C expected in Lahore by 14:00.", geo: "31.55°N 74.34°E" },
  { src: "Traffic",     color: "rgb(167, 139, 250)", text: "Multi-vehicle collision reported on Shahrah-e-Faisal.", geo: "24.86°N 67.07°E" },
  { src: "Citizen",     color: "rgb(244, 63, 94)",  text: "DHA Phase 6 mein bijli nahi, 4 ghantay ho gaye.", geo: "24.79°N 67.04°E" },
  { src: "Underpass",   color: "rgb(34, 211, 238)", text: "Underpass at Nazimabad flooded knee-deep, avoid route.", geo: "24.91°N 67.03°E" },
  { src: "Weather",     color: "rgb(56, 189, 248)", text: "Monsoon cell intensifying over Karachi south.", geo: "24.84°N 67.02°E" },
  { src: "Grid SCADA",  color: "rgb(251, 146, 60)", text: "Feeder F-114 trip event; auto-reclose failed.", geo: "24.79°N 67.04°E" },
  { src: "Rescue 1122", color: "rgb(52, 211, 153)", text: "Crew Alpha-3 on scene; 4 patients triaged.", geo: "24.86°N 67.07°E" },
];

/* ============================================================
   TICKER ITEMS — top status strip
   ============================================================ */
export const TICKER_ITEMS = [
  "AGENT MESH: 6/6 NOMINAL",
  "INGEST RATE: 1,284 SIG/MIN",
  "VERIFIED CLUSTERS: 4",
  "ACTIVE INCIDENTS: 2",
  "AVG DECISION LATENCY: 1.42s",
  "MODEL: SENTINEL-OPS v4.7",
  "ANTIGRAVITY LINK: STABLE",
  "TRUST FLOOR: 0.71",
  "CITIES ONLINE: KHI · LHR · MUL · ISB",
];

/* ============================================================
   CITY OPTIONS — onboarding
   ============================================================ */
export const CITIES = [
  { id: "karachi",   name: "Karachi",   country: "PK", pop: "16M", lat: 24.86, lng: 67.01, density: "high" },
  { id: "lahore",    name: "Lahore",    country: "PK", pop: "13M", lat: 31.55, lng: 74.34, density: "high" },
  { id: "islamabad", name: "Islamabad", country: "PK", pop: "1.2M", lat: 33.69, lng: 73.05, density: "med" },
  { id: "multan",    name: "Multan",    country: "PK", pop: "1.9M", lat: 30.16, lng: 71.50, density: "med" },
  { id: "peshawar",  name: "Peshawar",  country: "PK", pop: "2.1M", lat: 34.01, lng: 71.58, density: "med" },
  { id: "rawalpindi",name: "Rawalpindi", country: "PK", pop: "2.3M", lat: 33.60, lng: 73.04, density: "med" },
];
