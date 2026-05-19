# Sentinel — Crisis Intelligence & Response Orchestrator (CIRO)

> Built with **Google Antigravity**.

Sentinel is an agentic AI system for urban crisis response. It ingests noisy
multi-source signals (citizen posts in English/Roman-Urdu, weather, traffic,
infrastructure feeds), detects emerging crises in real time, reasons about
severity and impact, plans a coordinated response, **simulates** the execution
of that response, and visualizes the before/after outcome — end to end.

Built for Pakistani metropolitans (Karachi, Lahore, Islamabad, Multan) where
urban flooding, heatwaves, road blockages, accidents and infrastructure
failures are frequent and response is fragmented, reactive and slow.

**Live**

| | Link |
|---|---|
| Web app | https://sentinel.shahmeermajid456.workers.dev |
| API backend | https://sentinel-backend-cupp.onrender.com |
| Code | https://github.com/dopamine-py/sentinel |
| Mobile | Android APK (built via EAS — see *Mobile* below) |

---

## Built with Google Antigravity

The entire system — its multi-agent workflow, reasoning pipeline, tool
integrations, simulation layer and the web + mobile clients — was designed,
orchestrated and built inside **Google Antigravity**, Google's agent-first
development platform.

Antigravity is used to:

- **Orchestrate the multi-agent workflow** — the six-agent
  *planning → decision → execution* pipeline (below) was architected and
  wired together as an Antigravity agentic workflow.
- **Plan and execute decisions** — Antigravity drives the agent task
  decomposition: signal parsing → crisis classification → situation
  analysis → action planning → simulated execution → outcome scoring.
- **Integrate tools** — Antigravity coordinates the external tool/API
  surface: the Gemini reasoning model, the OpenWeather feed, live news RSS
  ingestion, Tavily search, and the OpenStreetMap/OSRM mapping + rerouting
  used in the response simulation.
- **Simulate coordinated actions** — the SimulationAgent's mock traffic
  reroute, emergency dispatch, ticketing and alerting were modelled and
  iterated within Antigravity.

The agent runtime itself is a deterministic FastAPI pipeline (so it is
inspectable, streamable and reproducible for the demo); Antigravity is the
agentic environment in which that orchestration was conceived, composed and
shipped across all three surfaces (backend, web, mobile).

---

## System architecture

```
                       ┌─────────────────────────────────────────────┐
 Multi-source signals  │  INGESTION                                  │
 ───────────────────►  │  • Citizen posts (EN / Roman-Urdu, noisy)   │
  social · weather ·   │  • Weather API (OpenWeather)                 │
  traffic · RSS news · │  • Live Pakistani news RSS (feedparser)     │
  infra reports        │  • Tavily web search                        │
                       │  • Mock scenario sources (offline/demo)     │
                       └───────────────────────┬─────────────────────┘
                                               ▼
   ┌───────────────────────────  6-AGENT PIPELINE  ───────────────────────────┐
   │ 1 SignalIngestionAgent   parse · normalize · dedupe · geocode noisy text │
   │ 2 CrisisDetectionAgent   cluster signals · anomaly detect · classify     │
   │ 3 SituationAnalysisAgent severity · confidence · impact · explanation    │
   │ 4 ActionPlanningAgent    coordinated actions: routing/alerts/resources   │
   │ 5 SimulationAgent        simulate reroute · dispatch · tickets · alerts  │
   │ 6 OutcomeEvaluationAgent before/after scoring · after-action summary     │
   └───────────────────────────────────┬──────────────────────────────────────┘
                                        ▼
            ┌───────────────────────────────────────────────────────┐
            │  FastAPI backend  (in-memory run registry)            │
            │  • POST /api/ciro/run            async run            │
            │  • GET  /api/ciro/runs/{id}/stream   SSE live trace   │
            │  • POST /api/ciro/scan/live      autonomous omni-scan │
            │  • GET  /api/ciro/runs · /status · /scenarios         │
            └───────────────┬───────────────────────┬───────────────┘
                            ▼                       ▼
        ┌────────────────────────────┐   ┌──────────────────────────┐
        │  Web (TanStack Start SSR)  │   │  Mobile (Expo / RN)      │
        │  Cloudflare Worker proxies │   │  Console · Map · Settings│
        │  /api/sentinel/* → backend │   │  + bundled cinematic demo│
        │  Console · Landing · Demo  │   │  defaults to hosted API  │
        └────────────────────────────┘   └──────────────────────────┘
```

**Hosting:** Web → Cloudflare Workers · Backend → Render · Code → GitHub.
The Worker mirrors the dev proxy in production (`/api/sentinel/*` → Render),
streaming Server-Sent Events so the live agent reasoning works on the public
URL. If the backend is unreachable the clients degrade gracefully to a
bundled dataset (no crash, no dead end).

### The six agents

| # | Agent | Responsibility |
|---|---|---|
| 1 | **SignalIngestionAgent** | Parses raw multi-source signals, handles informal/Roman-Urdu text, dedupes, geocodes, normalizes into structured `CrisisSignal`s. |
| 2 | **CrisisDetectionAgent** | Clusters signals, detects anomalies, classifies the crisis type (flooding / heatwave / blockage / accident / infrastructure). |
| 3 | **SituationAnalysisAgent** | Infers the situation, estimates severity, produces a **confidence level + explanation** and an impact assessment. |
| 4 | **ActionPlanningAgent** | Generates coordinated response actions: traffic rerouting, emergency dispatch, alerts, resource allocation — prioritized with assignees. |
| 5 | **SimulationAgent** | Simulates execution: mock route updates, emergency tickets, simulated alerts, system-status changes, and **before/after snapshots**. |
| 6 | **OutcomeEvaluationAgent** | Scores the simulated outcome (mobility/safety/equity), writes the after-action summary. |

Each agent emits a **trace step** (input summary, reasoning, output, tool
calls, confidence, duration). These stream live over SSE and render with a
typewriter "chain-of-thought" effect in the console — satisfying the Agent
Trace / Logs deliverable.

---

## Tools & APIs used

| Tool / API | Use |
|---|---|
| **Google Gemini** | LLM reasoning for classification, situation analysis, planning, evaluation |
| **OpenWeather API** | Live weather signal source (rainfall/heat alerts) |
| **Pakistani news RSS** (`feedparser`, `BeautifulSoup`) | Live news signal ingestion |
| **Tavily Search** | Open-web signal corroboration |
| **OpenStreetMap + OSRM** | Map rendering and the traffic-rerouting simulation |
| **FastAPI + Uvicorn** | Agent pipeline API + SSE live reasoning stream |
| **TanStack Start + React** | Web console (SSR) — Cloudflare Workers |
| **Expo / React Native** | Mobile app (Android APK via EAS) |
| **Cloudflare Workers / Render** | Web + backend hosting |

---

## End-to-end example

**Input signals**

- Citizen: *"G-10 mein pani bhar gaya hai, gaariyan phans gayi hain"*
- Weather: heavy-rainfall alert
- Traffic: congestion spike

**Sentinel output**

- **Detected:** Urban flooding (G-10 / George Town) — **confidence: High**
- **Impact:** arterial traffic blocked, vehicles stranded, ~N people exposed
- **Recommended actions:** reroute traffic via alternates · dispatch rescue ·
  push Urdu/English cell broadcast · pre-position ambulances
- **Simulated execution:** map route updated · emergency ticket created ·
  alerts sent · system status → managing
- **Outcome:** congestion reduced (before/after), no fatalities in sim window,
  composite KPI scored

---

## Repository layout

| Path | What it is |
|---|---|
| `urban-sentinel-main/` | Web app — TanStack Start (SSR) + React. Console, landing, onboarding, `/demo`. Deploys to Cloudflare Workers. |
| `signal-intelligence-main/` | FastAPI backend — the 6-agent CIRO pipeline, multi-source ingestion, SSE reasoning stream. |
| `signal-intelligence-main/ciro-mobile/` | Expo / React Native mobile app. |
| `sentinel-demo-static/` | Standalone build of the cinematic demo. `npm run build:bundle` emits one self-contained HTML consumed by **both** the web `/demo` route and mobile onboarding (single source of truth). |

---

## Run locally

**Backend** (port 8000) — needs `signal-intelligence-main/.env` (copy from
`.env.example`):
```bash
cd signal-intelligence-main
pip install -r requirements.txt
uvicorn src.api:app --host 0.0.0.0 --port 8000
```

**Web** (proxies `/api/sentinel/*` → backend):
```bash
cd urban-sentinel-main
npm install && npm run dev
```

**Mobile** (defaults to the hosted backend; override the API base in
Settings for a local backend):
```bash
cd signal-intelligence-main/ciro-mobile
npm install && npx expo start
# Android APK:
eas build --platform android --profile preview
```

**Rebuild the cinematic demo** after editing it:
```bash
cd sentinel-demo-static
npm run build:bundle
```

---

## Assumptions

- **Simulated datasets/APIs** are used where live sources are unavailable or
  rate-limited; the system never depends on real sensitive data.
- Action **execution is simulated** (mock map updates, tickets, alerts,
  status changes) — the focus is decision-making, not real dispatch.
- Geocoding of free-text locations uses a city/area heuristic for the
  Pakistani metros in scope.
- The public deployment runs on free hosting tiers; the backend cold-starts
  after idle (~40s) — clients degrade gracefully to a bundled dataset
  meanwhile, so the demo never breaks.
- Secrets live only in `.env` / host env vars and are never committed.
