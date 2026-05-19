# CIRO: Crisis Intelligence & Response Orchestrator
**Hackathon Submission Documentation**

## 🌟 Project Overview
Metropolitans face rapid, unpredictable crises like urban flooding, heatwaves, and road blockages. Current response systems are reactive and fragmented. CIRO is an **Agentic AI System** that autonomously ingests multi-source signals, detects crises, plans coordinated actions, and simulates their execution in real-time.

---

## 🤖 The 6-Agent Pipeline (Powered by Gemini)
The core of CIRO is a sequential multi-agent workflow where each agent handles a specific cognitive task. The agents pass structured JSON outputs down the chain:

1. **SignalIngestionAgent**: Parses and normalizes raw multi-lingual (Urdu/English) signals from citizen reports, weather APIs, traffic data, and social media.
2. **CrisisDetectionAgent**: Clusters signals to classify the crisis type, pinpoint the location, and assign a confidence score and severity level.
3. **SituationAnalysisAgent**: Estimates the affected population, infrastructure risk, and time sensitivity.
4. **ActionPlanningAgent**: Generates 4–6 coordinated, prioritized response actions (e.g., traffic rerouting, emergency dispatch, resource allocation).
5. **SimulationAgent (CRITICAL)**: Executes actions against a mock city state. It modifies congestion indexes, tracks deployed units, updates map routes via OSRM, and generates dispatch tickets.
6. **OutcomeEvaluationAgent**: Compares the "Before" and "After" states to score the effectiveness of the response and highlight remaining risks.

---

## 🛠️ Technical Stack & What We Built

### 1. The Autonomous Backend (`signal-intelligence-main`)
- **Framework**: FastAPI (Python).
- **LLM Engine**: Gemini 2.0 Flash via `google-genai` SDK.
- **Live Integrations**: OpenWeatherMap, Pakistani News RSS feeds, simulated Traffic APIs, and Tavily for web search.
- **Background Scanner**: Autonomously polls live sources every 10 minutes, triggering the agent mesh if anomalies are found.

### 2. The Web Console (`urban-sentinel-main`)
- **Framework**: React + Vite + Tailwind CSS.
- **Design**: Premium glassmorphic UI designed for Incident Commanders.
- **Features**: 
  - Live, auto-updating signal feed.
  - Granular Agent Reasoning Trace showing exact LLM inputs, tool calls, and outputs.
  - Real-time KPIs (Mobility, Safety, Equity) showing the simulated impact of the agents' decisions.

### 3. The Mobile App (`ciro-mobile`)
- **Framework**: React Native & Expo.
- **Features**:
  - **Interactive Simulation Maps**: Uses Leaflet and OSRM to physically plot the affected crisis zone (red circle), the compromised primary route (dashed red), and the simulated alternate reroute (solid green).
  - Push notifications simulating citizen alerts.
  - Full mission detail view showing the dispatch queue and execution status.

---

## 🌌 Use of Google Antigravity (Mandatory Requirement)
**Google Antigravity** was used as the primary AI orchestration and development layer for the entire project:
- **Orchestration**: Designed the deterministic 6-agent handoff pipeline, ensuring reliable multi-agent execution without infinite loops.
- **Planning & Execution**: Crafted the prompt logic and structured JSON schemas that allow the `ActionPlanningAgent` to dictate plans, and the `SimulationAgent` to mathematically simulate them.
- **Tool Integration**: Wrote the integrations for OSRM mapping, OpenWeatherMap, and React Native maps.
- **Full-Stack Generation**: Antigravity generated the FastAPI backend, the React Native mobile app, and the React Vite web console, ensuring they all communicate flawlessly over REST.

---

## 🚦 Simulation Specifics (Addressing Challenge Focus)
The challenge heavily emphasized action simulation. Our system doesn't just suggest actions; it mathematically and visually simulates them:
- **Traffic Rerouting**: The simulation agent queries the OSRM routing engine to find alternate routes around the geo-fenced crisis zone. It calculates the time saved and draws the new route on the mobile app's map.
- **State Mutation**: Congestion drops (e.g., `9.2 → 4.1`), and average speeds increase as the simulation runs.
- **Ticketing**: Every dispatch or alert generates a mock ticket ID (e.g., `TRF-20240512-A3F1`) that is logged in the system's outcome ledger.

---

## 🎯 Final Outcomes
By merging real-time observability with multi-agent reasoning and deterministic simulation, CIRO transforms chaotic city signals into managed, orchestrated recovery plans in under 15 seconds.
