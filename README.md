# Sentinel

Autonomous crisis intelligence and emergency response orchestration for smart cities.
Sentinel ingests live citizen, weather, traffic and infrastructure signals, then a
mesh of six agents observes, verifies, decides, executes and adapts — in seconds.

## Monorepo layout

| Path | What it is |
|---|---|
| `urban-sentinel-main/` | Web app — TanStack Start (SSR) + React, the operator console, landing, onboarding, and `/demo`. Deploys to Cloudflare Workers. |
| `signal-intelligence-main/` | Python FastAPI backend — the CIRO 6-agent pipeline, live signal ingestion (RSS / weather / Tavily), SSE reasoning stream. |
| `signal-intelligence-main/ciro-mobile/` | Expo (React Native) mobile app — onboarding, console, map, settings. |
| `sentinel-demo-static/` | Standalone build of the cinematic `/demo`. `npm run build:bundle` emits the single-file HTML consumed by both the web `/demo` route and the mobile onboarding. |

## Run it

**Backend** (port 8000):
```bash
cd signal-intelligence-main
uvicorn src.api:app --host 0.0.0.0 --port 8000
```

**Web** (proxies `/api/sentinel/*` → backend :8000):
```bash
cd urban-sentinel-main
npm install
npm run dev
```

**Mobile**:
```bash
cd signal-intelligence-main/ciro-mobile
npm install
npx expo start
```

**Rebuild the demo** (after editing `sentinel-demo-static/src/Demo.tsx`):
```bash
cd sentinel-demo-static
npm run build:bundle   # regenerates web + mobile demoHtml
```

## Notes

- Secrets live in `signal-intelligence-main/.env` (gitignored — never committed).
- The web app degrades gracefully: if the backend is offline it runs on a bundled
  demo dataset; live "Scan everything" needs the FastAPI backend reachable.
