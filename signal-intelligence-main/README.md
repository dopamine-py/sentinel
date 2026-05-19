# CIRO — Crisis Intelligence & Response Orchestrator

> An autonomous, multi-agent AI system for real-time urban crisis detection, coordinated response planning, and simulation — built for Pakistani metropolitans.

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LIVE SIGNAL SOURCES                          │
│  Pakistani News RSS  │  OpenWeatherMap  │  Traffic API  │  Tavily   │
└──────────────┬──────────────────────────────────────────────────────┘
               │ CrisisSignal objects
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     CIRO AGENTIC PIPELINE                           │
│                    (orchestrated by Antigravity)                    │
│                                                                     │
│  Agent 1        Agent 2          Agent 3         Agent 4            │
│  IngestionAgent → CrisisDetection → SituationAnalysis → ActionPlanning│
│                                                                     │
│  Agent 5              Agent 6                                       │
│  SimulationAgent  →  OutcomeEvaluation                              │
└──────────────────────────────────────┬──────────────────────────────┘
                                       │ PipelineRun
               ┌───────────────────────┼───────────────────────┐
               ▼                       ▼                       ▼
        Web Dashboard           Mobile App (APK)        REST API
        (index.html)            (React Native)     (FastAPI / uvicorn)
        Live Feed page          Crisis map
        (live.html)             Push notifications
```

---

## 🤖 Google Antigravity Usage

This project was **architected and built using Google Antigravity** as the primary AI orchestration layer:

| Antigravity Role | How Used |
|---|---|
| **Multi-agent workflow design** | Antigravity designed the 6-agent sequential pipeline (Ingestion → Detection → Analysis → Planning → Simulation → Evaluation) |
| **Decision logic** | Each agent's reasoning prompt was crafted and iterated by Antigravity |
| **Tool integration** | Antigravity integrated OpenWeatherMap, RSS feeds, Tavily, FastAPI, and Expo |
| **Code generation** | All backend agents, API endpoints, live sources, and mobile screens |
| **Debugging & iteration** | Fallback logic, rate-limit handling, and filter tuning |

**LLM Engine:** Gemini 2.0 Flash (`gemini-2.0-flash`) powers the reasoning inside each agent via `google-genai` SDK.

---

## 🧠 The 6-Agent Pipeline

| Step | Agent | What it does |
|---|---|---|
| 1 | **IngestionAgent** | Normalises raw signals into `CrisisSignal` objects, deduplicates, scores credibility |
| 2 | **CrisisDetectionAgent** | Uses Gemini to classify signals → crisis type, location, confidence (0–1), severity |
| 3 | **SituationAnalysisAgent** | Estimates affected population, infrastructure risk, time sensitivity |
| 4 | **ActionPlanningAgent** | Generates 4–6 coordinated response actions (rerouting, dispatch, alerts, resources) |
| 5 | **SimulationAgent** | Executes actions against a mock city state; generates tickets, alert counts, route names |
| 6 | **OutcomeEvaluationAgent** | Scores effectiveness (0–100), identifies improvements and residual risks |

Each agent appends an `AgentTrace` with: reasoning, duration, tool calls, and output summary — visible in Dashboard and mobile app.

---

## 📡 Live Signal Sources

| Source | Type | Data |
|---|---|---|
| **Dawn, Geo, ARY, Express Tribune, The News, Pakistan Today** | RSS feeds | Crisis-filtered Pakistani news headlines |
| **OpenWeatherMap** | Real API | Live temperature, rainfall, wind for 6 cities |
| **Traffic API (Simulated)** | Mock API | Congestion index, speed, delay for 7 major corridors |
| **Tavily Search** | Web search | Autonomous web search for crisis keywords |

**Autonomous mode:** The system runs a full pipeline scan every 10 minutes in the background — no manual input required.

---

## 🔧 Tools & APIs

| Tool | Purpose |
|---|---|
| `google-genai` | Gemini 2.0 Flash LLM for agent reasoning |
| `FastAPI` + `uvicorn` | REST API server |
| `feedparser` | Pakistani news RSS parsing |
| `OpenWeatherMap API` | Real-time weather data |
| `Tavily API` | Autonomous web search |
| `React Native / Expo` | Mobile app (Android APK) |
| `react-native-maps` | Crisis map with rerouting |
| `expo-notifications` | Push alerts on crisis detection |

---

## 🎮 Simulation Outputs

Each pipeline run produces concrete simulation artifacts:

```
REROUTE ACTIVE [TRF-20240512-A3F1]: Kashmir Highway → IJP Road.
~640 vehicles redirected. Congestion: 9.2 → 6.8. Speed: 4 → 18 km/h.

DISPATCH TICKET [EMG-20240512-B2C4]: 4 units en route.
ETA: 8 min to G-10 Markaz. Total deployed: 4.

ALERT SENT [ALT-20240512-D7E9]: 32,400 residents notified.
SMS: 19,440 | App push: 9,720 | Radio: 3,240. Target: G-9, G-10, G-11.

RESOURCE TICKET [RES-20240512-F1A2]: 3 units allocated to G-10 Community Center.
```

**Before → After (example):**
- Congestion index: `9.2 → 4.1` (CRISIS_MANAGED)
- Avg speed: `4 km/h → 31 km/h`
- Emergency units deployed: `0 → 7`
- Alerts sent: `0 → 32,400`

---

## 🚀 Running Locally

### Backend
```bash
cd signal-intelligence-main
pip install -r requirements.txt
cp .env.example .env   # add your API keys
uvicorn src.api:app --host 0.0.0.0 --port 8000
```

### Web Dashboard
Open `http://localhost:8000/ciro/index.html`

### Mobile App
Install the APK from:
```
https://expo.dev/accounts/shahmeer456/projects/ciro-crisis-app/builds/672fbd9b-dd9d-457f-a1ef-93b30c7fdc8e
```

---

## 🔑 Environment Variables

```env
GEMINI_API_KEY=your_gemini_key          # Required — powers all 6 agents
OPENWEATHER_API_KEY=your_owm_key        # Optional — real weather data
TAVILY_API_KEY=your_tavily_key          # Optional — autonomous web search
```

---

## 📋 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/ciro/run/sync` | POST | Run full pipeline on a scenario + custom signals |
| `/api/ciro/scan/live/sync` | POST | Autonomous scan of all live sources |
| `/api/ciro/scan/live` | POST | Background async scan |
| `/api/ciro/runs` | GET | List all pipeline runs |
| `/api/ciro/runs/{run_id}` | GET | Full run detail with agent traces |
| `/api/ciro/scenarios` | GET | Available crisis scenarios |

---

## 💡 Key Assumptions

1. **Traffic API is simulated** — uses realistic baseline congestion with peak-hour modelling. In production, replace with Google Maps Traffic or HERE API.
2. **Weather alerts** require OpenWeatherMap key activation (~15 min after registration).
3. **Emergency dispatch** is simulated — real integration would connect to NDMA/Rescue 1122 APIs.
4. **Alert delivery** is simulated — in production, integrate Twilio (SMS) and FCM (push).
5. **Crisis scope** is urban infrastructure only — terrorism/security incidents are explicitly excluded (law enforcement domain).

---

## 🏗 Project Structure

```
signal-intelligence-main/
├── src/
│   ├── crisis_agents.py      # All 6 agents (Detection, Planning, Simulation, etc.)
│   ├── crisis_pipeline.py    # Sequential pipeline orchestrator
│   ├── crisis_models.py      # Data models (CrisisSignal, ActionPlan, etc.)
│   ├── live_sources.py       # RSS, Weather, Traffic, Tavily ingestion
│   ├── llm_client.py         # Gemini 2.0 Flash client
│   └── api.py                # FastAPI server + background auto-scanner
├── ciro_dashboard/
│   ├── index.html            # Main dashboard
│   ├── live.html             # Live feed page
│   ├── style.css             # Design system
│   └── app.js                # Dashboard JS
└── ciro-mobile/              # React Native / Expo mobile app
    ├── App.js                # Navigation root
    └── src/
        ├── api.js            # API client
        ├── notifications.js  # Push notification service
        └── screens/
            ├── HomeScreen.js   # Alert feed + scan
            ├── DetailScreen.js # Crisis report detail
            ├── MapScreen.js    # Crisis map + rerouting
            └── SettingsScreen.js
```
