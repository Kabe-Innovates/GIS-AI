# GeoNex Overall App Roadmap

This roadmap covers the complete GeoNex application, not only GeoServer. It tracks product, geospatial services, backend APIs, AI insights, frontend experience, security, deployment, and launch readiness.

## Status Legend
- `Completed`: Implemented and verified in this workspace
- `In Progress`: Partially implemented
- `Planned`: Not yet implemented

## Product Goal
Build a GIS + AI application that lets users explore Tamil Nadu geospatial datasets, query incidents and boundaries, and generate actionable insights from map and attribute data.

## Phase 0: Product Scope and Architecture
Status: `In Progress`

Goals:
- Define user journeys (admin, analyst, viewer).
- Freeze MVP scope for hackathon/demo.
- Define target architecture across data, geospatial server, backend, AI service, and frontend.

Deliverables:
- App-level requirements and acceptance criteria.
- High-level architecture diagram.
- Prioritized backlog for MVP vs post-MVP.

## Phase 1: Geospatial Platform Foundation
Status: `Completed`

Goals:
- Stand up reproducible GeoServer runtime.
- Persist state across restarts.
- Publish core base layers.

Delivered:
- `geoserver/docker-compose.yml`
- `geoserver/.env.example`
- `geoserver/scripts/start_geoserver.sh`
- `geoserver/scripts/publish_accidents_layer.sh`
- `geoserver/scripts/validate_endpoints.sh`
- Stable workspace and layers under `geonex`.

## Phase 2: Data Ingestion and Cataloging
Status: `In Progress`

Goals:
- Standardize ingest of all current GeoJSON/shapefile assets.
- Maintain deterministic layer naming and metadata.
- Keep ingestion idempotent and restart-safe.

Next tasks:
- Add per-layer metadata registry (title, description, geometry type, source).
- Track source file updates and refresh only changed layers.
- Add quality checks for CRS, invalid geometry, and missing attributes.

## Phase 3: Backend API Layer
Status: `Planned`

Goals:
- Expose app-friendly APIs that abstract raw WMS/WFS calls.
- Provide consistent filtering, paging, and error handling.

Planned endpoints:
- `GET /layers` for layer catalog.
- `GET /features` with bbox + attribute filters.
- `GET /feature/{id}` for detail drilldown.
- `POST /insights/query` to trigger AI insight workflows.

Deliverables:
- Backend service scaffold.
- Config-driven layer-to-endpoint mapping.
- Contract documentation (request/response examples).

## Phase 4: AI Insights Engine
Status: `Planned`

Goals:
- Generate insights from selected geography + attributes.
- Support summary, anomaly hints, and trend narratives.

Planned capabilities:
- Region-level aggregation and severity summaries.
- Temporal trend extraction.
- Prompt templates for map-context-aware outputs.
- Guardrails and confidence/limitations section in responses.

Deliverables:
- AI service module integrated with backend APIs.
- Evaluation set for deterministic regression checks.

## Phase 5: Frontend Application
Status: `Planned`

Goals:
- Deliver an interactive map-centric UI for exploration and insights.

Planned modules:
- Map canvas with base + thematic layer toggles.
- Layer legend and style controls.
- Filter panel (district, severity, time range).
- Feature popup/details panel.
- Insights panel with generated narrative + metrics.

Deliverables:
- Responsive UI (desktop and mobile support).
- Frontend integration with backend and geospatial services.

## Phase 6: Security and Access Control
Status: `Planned`

Goals:
- Enforce least-privilege access across platform components.

Planned tasks:
- Create GeoServer read-only app role/user (`APP_READONLY`, `app_reader`).
- Store credentials in env/secrets, never hardcoded.
- Restrict admin endpoints from app runtime paths.
- Add audit logging for authentication and privileged actions.

## Phase 7: Observability and Reliability
Status: `Planned`

Goals:
- Detect breakages quickly and keep demo/runtime stable.

Planned tasks:
- Health checks for GeoServer, backend API, and AI service.
- End-to-end smoke tests for all published layers.
- Structured logs and failure diagnostics.
- Recovery playbook for container restart, data refresh, and re-publish.

## Phase 8: Deployment and Environment Management
Status: `Planned`

Goals:
- Support repeatable local and demo/staging deployments.

Planned tasks:
- Environment profiles (`local`, `demo`, `staging`).
- Deployment scripts and startup order controls.
- Persistent volume and backup strategy.
- Release checklist with rollback procedure.

## Phase 9: QA, UAT, and Launch Readiness
Status: `Planned`

Goals:
- Validate user experience, correctness, and performance before launch.

Planned tasks:
- Functional test matrix (map, filters, feature inspect, insights).
- Performance pass on large layers.
- User acceptance walkthrough.
- Demo script and contingency playbook.

## Milestone View
- `M1` Platform Ready: Phases 1-2 complete.
- `M2` App Core Ready: Phases 3 and 5 complete.
- `M3` Intelligence Ready: Phase 4 complete.
- `M4` Launch Ready: Phases 6-9 complete.

## Immediate Next Sprint (Recommended)
1. Implement backend API scaffold and `/layers` + `/features` endpoints.
2. Complete GeoServer read-only app user/role setup.
3. Add full-layer validation script (WMS + WFS checks for every published layer).
