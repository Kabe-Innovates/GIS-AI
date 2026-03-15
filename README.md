# GeoNex

Minimal GIS + AI demo stack for Tamil Nadu geospatial exploration.

GeoNex combines:
- GeoServer (WMS/WFS) for published geospatial layers
- Vite + Leaflet frontend for interactive map exploration
- Optional local LLM (Ollama) for map-aware insights

## Architecture

`Data Samples -> GeoServer -> Frontend Map -> Optional Local AI`

- GeoServer publishes layers into workspace `geonex`
- Frontend consumes CSV + WFS context and renders map interactions
- AI assistant can use local model responses plus GeoServer context

## Repository Layout

- `app/`: Vite frontend (`npm run dev`, `npm run build`)
- `geoserver/`: Docker Compose runtime and GeoServer helper scripts
- `Data Samples/`: Source datasets (GeoJSON + shapefiles)
- `ROADMAP.md`: implementation roadmap and phase status

## Prerequisites

- Docker + Docker Compose
- Node.js 18+ and npm
- Optional for AI: Ollama (`http://127.0.0.1:11434`)

## Quick Start

### 1) Start GeoServer

```bash
cd geoserver
cp .env.example .env
# set GEOSERVER_ADMIN_PASSWORD in .env
./scripts/start_geoserver.sh
```

GeoServer UI: `http://localhost:8080/geoserver/web`

### 2) Run Frontend

```bash
cd app
npm install
npm run dev
```

Frontend: `http://localhost:5173`

### 3) Optional: Enable Local AI

Start Ollama and pull at least one model used by the app:

```bash
ollama serve
ollama pull qwen2.5:3b
# optional fallback
ollama pull phi3:mini
```

The frontend proxies:
- `/api` -> `http://127.0.0.1:11434` (Ollama)
- `/geoserver` -> `http://127.0.0.1:8080` (GeoServer)

## Verification

Validate GeoServer endpoints:

```bash
cd geoserver
./scripts/validate_endpoints.sh "http://localhost:8080/geoserver" "admin" "<password>" "geonex" "tn_accidents_500"
```

Expected: all checks return HTTP 200.

## Build

```bash
cd app
npm run build
npm run preview
```

## Notes

- GeoServer layer publishing is idempotent via `geoserver/scripts/start_geoserver.sh`.
- Credentials are environment-based (`geoserver/.env`).
- For deeper operational details, see `geoserver/README.md`.
