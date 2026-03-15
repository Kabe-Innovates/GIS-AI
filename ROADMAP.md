# GeoNex Implementation Roadmap

This roadmap is an execution plan for delivering the full GeoNex app (GeoServer + backend + frontend + AI + launch readiness).

## Status Legend
- `Completed`: Implemented and verified in this workspace
- `In Progress`: Started, but definition of done not yet met
- `Planned`: Not started

## Product Goal
Build a GIS + AI app for Tamil Nadu datasets where users can:
- Explore boundary and incident layers on a map
- Filter and inspect features
- Generate short, reliable map-aware insights

## Operating Constraints
- Demo-first scope: local environment must be reproducible from this repo.
- Existing GeoServer setup is already the base platform and should not be reworked unless blocked.
- Credentials must come from environment variables only.

## Final Demo Success Criteria
- User can open the map, toggle layers, filter incidents, click a feature, and request AI insights.
- End-to-end flow completes without manual GeoServer intervention.
- No hardcoded credentials in runtime paths.

## Phase 0: Product Scope and Architecture
Status: `In Progress`

Objective:
- Freeze scope and technical decisions so implementation does not drift.

Implementation Steps:
1. Finalize MVP user journeys for `admin`, `analyst`, and `viewer`.
2. Decide stack choices and record them in this file:
	- Backend framework
	- Frontend framework
	- LLM provider/model
3. Draw system architecture: `Data Samples -> GeoServer -> Backend API -> Frontend -> AI insights`.
4. Split backlog into `MVP` and `post-MVP`.

Dependencies:
- None

Definition of Done:
- Scope is frozen and stack choices are explicitly documented.
- Architecture diagram exists and is shared with the team.

Verification:
- Team can answer "what is in MVP" in one sentence without disagreement.

Outputs:
- Updated `ROADMAP.md` with finalized decisions
- One architecture diagram file (location to be decided)

## Phase 1: Geospatial Platform Foundation
Status: `Completed`

Objective:
- Maintain reproducible GeoServer runtime with stable published layers.

Implemented Artifacts:
- `geoserver/docker-compose.yml`
- `geoserver/.env.example`
- `geoserver/scripts/start_geoserver.sh`
- `geoserver/scripts/publish_accidents_layer.sh`
- `geoserver/scripts/validate_endpoints.sh`

Current Verified Behavior:
- `start_geoserver.sh` starts container and processes a hardcoded list of 10 GeoJSON sources.
- Layers already in workspace `geonex` are detected idempotently.
- Endpoint validation script exists and passes WMS/WFS checks for configured layers.

Definition of Done:
- GeoServer starts cleanly and required layers are available after restart.

Verification:
1. Run `geoserver/scripts/start_geoserver.sh`
2. Run `geoserver/scripts/validate_endpoints.sh geonex tn_accidents_500`

Outputs:
- Stable `geonex` workspace and published base layers

## Phase 2: Data Ingestion and Cataloging
Status: `In Progress`

Objective:
- Move from hardcoded ingest behavior to catalog-driven, auditable ingestion.

Implementation Steps:
1. Add metadata registry file for all layers (name, source file, geometry type, CRS, key attributes).
2. Define canonical layer naming rules and apply consistently.
3. Add validation checks for:
	- CRS consistency
	- Invalid/empty geometry
	- Required attributes
4. Add refresh policy: only changed sources are republished.
5. Keep ingestion idempotent on reruns.

Dependencies:
- Phase 1 complete

Definition of Done:
- Every published layer is listed in a registry with metadata.
- Validation script passes for all cataloged layers.
- Ingestion rerun does not duplicate stores/layers.

Verification:
- Run ingestion once, rerun it, and confirm no duplicate artifacts.
- Run validation and get full pass for all target layers.

Outputs:
- Layer registry file
- Ingestion validation script/report

## Phase 3: Backend API Layer
Status: `Planned`

Objective:
- Provide stable application APIs over GeoServer WMS/WFS.

Implementation Steps:
1. Scaffold backend service with env-based GeoServer configuration.
2. Implement `GET /layers` using the layer registry as source of truth.
3. Implement `GET /features` with `layer`, `bbox`, and attribute filters.
4. Implement `GET /feature/{id}` for feature details.
5. Add consistent response shape and error contract.
6. Add request logging with latency and status code.

Dependencies:
- Phase 0 stack decision complete
- Phase 2 registry and validation available

Definition of Done:
- All three endpoints return valid responses for at least one real layer.
- Error responses are consistent across endpoints.

Verification:
- Curl/Postman checks for success and failure paths.
- Endpoint contract examples documented.

Outputs:
- Backend service directory and API docs

## Phase 4: AI Insights Engine
Status: `Planned`

Objective:
- Add explainable, bounded-latency map-aware insights.

Implementation Steps:
1. Implement `POST /insights/query` in backend.
2. Aggregate selected features by region/severity/time before prompting the model.
3. Create prompt template with clear context and required output format.
4. Return `insight`, `confidence`, and `limitations` in response.
5. Add caching for repeated queries and timeout fallback behavior.

Dependencies:
- Phase 0 model/provider decision complete
- Phase 3 API layer running

Definition of Done:
- Insights endpoint returns structured narrative for valid map/filter input.
- Timeout fallback returns safe output instead of failing request.

Verification:
- Run fixed evaluation prompts and confirm deterministic structure.
- Verify median response latency is within target set in Phase 0.

Outputs:
- Insights endpoint and evaluation set

## Phase 5: Frontend Application
Status: `Planned`

Objective:
- Deliver the map-first user interface for exploration and insights.

Implementation Steps:
1. Build map canvas and load base map.
2. Add layer toggle panel wired to `GET /layers`.
3. Add filters panel (district, severity, time range) wired to `GET /features`.
4. Add feature popup/detail panel wired to `GET /feature/{id}`.
5. Add insights panel wired to `POST /insights/query`.
6. Add loading, empty, and error states for every network action.
7. Validate responsive behavior for desktop and mobile.

Dependencies:
- Phase 0 frontend decision complete
- Phase 3 backend endpoints available
- Phase 4 insights endpoint available

Definition of Done:
- Full user flow works: toggle layer -> filter -> inspect feature -> request insight.

Verification:
- Manual walkthrough of all core paths.
- Basic browser/device checks for responsive layout.

Outputs:
- Frontend app integrated with backend and GeoServer-backed data

## Phase 6: Security and Access Control
Status: `Planned`

Objective:
- Enforce least-privilege access and credential hygiene.

Implementation Steps:
1. Create GeoServer app read role/user (`APP_READONLY`, `app_reader`).
2. Move runtime credentials to env/secrets only.
3. Ensure backend uses app_reader credentials for data requests.
4. Restrict admin-only endpoints from app runtime path.
5. Add audit logging for auth and privileged actions.

Dependencies:
- Phase 3 backend running

Definition of Done:
- No hardcoded credentials in repo runtime code.
- App functionality works with read-only service account.

Verification:
- Search codebase for hardcoded secret patterns.
- Execute full flow using read-only account.

Outputs:
- Hardened auth configuration and audit logs

## Phase 7: Observability and Reliability
Status: `Planned`

Objective:
- Detect failures early and recover quickly.

Implementation Steps:
1. Add health endpoints/checks for GeoServer, backend, and AI dependency.
2. Extend smoke tests to cover all published layers and key APIs.
3. Implement structured logs for request tracing and failure diagnosis.
4. Write recovery playbook for restart, data refresh, and republish.

Dependencies:
- Phases 3 to 6 operational

Definition of Done:
- Service health is visible and actionable.
- Recovery steps are documented and tested once.

Verification:
- Simulate one dependency failure and follow playbook to recover.

Outputs:
- Health checks, smoke suite, and runbook

## Phase 8: Deployment and Environment Management
Status: `Planned`

Objective:
- Make local/demo deployments repeatable and safe.

Implementation Steps:
1. Define environment profiles: `local`, `demo`, `staging`.
2. Standardize startup order for GeoServer, backend, frontend.
3. Define persistent volume strategy and backup/restore procedure.
4. Add release checklist including rollback steps.

Dependencies:
- Phases 3 to 7 complete enough for integration deployment

Definition of Done:
- Fresh setup can be started from documented steps with no hidden actions.

Verification:
- Dry-run deployment from clean environment using only docs/scripts.

Outputs:
- Deployment guide, environment config templates, rollback checklist

## Phase 9: QA, UAT, and Launch Readiness
Status: `Planned`

Objective:
- Confirm product correctness, usability, and demo stability.

Implementation Steps:
1. Create functional test matrix for map, filters, feature inspect, insights.
2. Run UAT walkthrough with expected outcomes per journey.
3. Add performance pass criteria and measure against target dataset.
4. Create demo script and contingency playbook.

Dependencies:
- Phases 3 to 8 completed

Definition of Done:
- QA matrix passed for MVP scope.
- Demo script can be executed end-to-end without ad hoc fixes.

Verification:
- Execute full rehearsal with timing and issue log.

Outputs:
- QA report, UAT signoff notes, demo runbook

## Milestone Gates
- `M1 Platform Ready`: Phase 0, Phase 1, and Phase 2 done.
- `M2 App Core Ready`: Phase 3 and Phase 5 done.
- `M3 Intelligence Ready`: Phase 4 done.
- `M4 Launch Ready`: Phase 6, Phase 7, Phase 8, and Phase 9 done.

## Sprint Plan (Start Implementation)

### Sprint 1 (Critical Path)
1. Finalize Phase 0 stack decisions and MVP boundaries.
2. Complete Phase 2 metadata registry and layer validation checks.
3. Scaffold backend and ship `GET /layers` and `GET /features`.

Sprint 1 Exit:
- Backend returns real data for at least one production layer.
- Catalog and validation are documented and runnable.

### Sprint 2 (Parallel Tracks)
1. Build frontend map canvas, toggles, and filters.
2. Add read-only auth model and env-based credential handling.
3. Add health checks and extend smoke tests.

Sprint 2 Exit:
- User can run map exploration flow end-to-end locally.

## Immediate Task List (Next 3 Tasks)
1. Create layer metadata registry file and populate existing layers.
2. Implement/extend layer validation script for all published layers.
3. Create backend scaffold and first two endpoints (`/layers`, `/features`).
