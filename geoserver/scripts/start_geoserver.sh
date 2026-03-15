#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

SERVICE_NAME="geoserver"
MOUNT_DIR="/mnt/data-samples"
IMPORT_DIR="/opt/geoserver/data_dir/imported_shp"
MAX_WAIT_SECONDS="${STARTUP_WAIT_SECONDS:-45}"
BASE_URL="${BASE_URL:-http://localhost:${GEOSERVER_PORT:-8080}/geoserver}"
REST_URL="${BASE_URL}/rest"
WORKSPACE="${GEOSERVER_WORKSPACE:-geonex}"
USER_NAME="${GEOSERVER_ADMIN_USER:-admin}"
PASSWORD="${GEOSERVER_ADMIN_PASSWORD:-geoserver}"

# Hardcoded GeoJSON files expected in the container mount.
EXPECTED_GEOJSON_FILES=(
  "Accidents_TN.geojson"
  "TAMIL NADU District Hq.geojson"
  "TAMIL NADU Sub District Hq.geojson"
  "TAMIL NADU VILLAGES.geojson"
  "TAMIL NADU_ASSEMBLY.geojson"
  "TAMIL NADU_DISTRICTS.geojson"
  "TAMIL NADU_STATE.geojson"
  "TAMIL NADU_VILLAGES.geojson"
  "TAMIL NADU_parliament.geojson"
  "TAMILNADU_SUBDISTRICTS.geojson"
)

auth="${USER_NAME}:${PASSWORD}"

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  value="${value//\"/&quot;}"
  value="${value//\'/&apos;}"
  printf '%s' "${value}"
}

sanitize_layer_name() {
  local raw="$1"
  local out

  out="$(printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]')"
  out="${out// /__}"
  out="$(printf '%s' "${out}" | sed -E 's/[^a-z0-9_]+/_/g; s/^_+//; s/_+$//')"

  if [[ -z "${out}" ]]; then
    out="layer"
  fi

  printf '%s' "${out}"
}

req() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local content_type="${4:-text/xml}"
  local code

  if [[ -n "${body}" ]]; then
    code=$(curl -sS -o /tmp/geonex_start_rest.out -w "%{http_code}" -u "${auth}" -X"${method}" \
      -H "Content-Type: ${content_type}" --data "${body}" "${url}" 2>/tmp/geonex_start_rest.err || true)
  else
    code=$(curl -sS -o /tmp/geonex_start_rest.out -w "%{http_code}" -u "${auth}" -X"${method}" "${url}" 2>/tmp/geonex_start_rest.err || true)
  fi

  if [[ -z "${code}" ]]; then
    code="000"
  fi
  printf '%s' "${code}"
}

echo "[1/4] Starting GeoServer container"
docker compose up -d "${SERVICE_NAME}"

echo "[2/4] Waiting for '${SERVICE_NAME}' to be running"
start_ts=$(date +%s)
while true; do
  if docker compose ps --status running --services | grep -qx "${SERVICE_NAME}"; then
    break
  fi

  now_ts=$(date +%s)
  if (( now_ts - start_ts >= MAX_WAIT_SECONDS )); then
    echo "[FAIL] '${SERVICE_NAME}' did not reach running state within ${MAX_WAIT_SECONDS}s"
    exit 1
  fi

  sleep 1
done

echo "[3/4] Listing GeoJSON files from container mount: ${MOUNT_DIR}"
if ! docker compose exec -T "${SERVICE_NAME}" sh -c 'test -d "$1"' sh "${MOUNT_DIR}" >/dev/null 2>&1; then
  echo "[WARN] Mount directory not found in container: ${MOUNT_DIR}"
  echo "GeoJSON count: 0"
  exit 0
fi

echo "GeoJSON files (hardcoded):"
present_count=0
for file_name in "${EXPECTED_GEOJSON_FILES[@]}"; do
  native_name="${file_name%.geojson}"
  layer_name="$(sanitize_layer_name "${native_name}")"

  if docker compose exec -T "${SERVICE_NAME}" sh -c 'test -f "$1"' sh "${MOUNT_DIR}/${file_name}" >/dev/null 2>&1; then
    printf '%s -> %s:%s\n' "${file_name}" "${WORKSPACE}" "${layer_name}"
    present_count=$((present_count + 1))
  else
    printf '%s [MISSING]\n' "${file_name}"
  fi
done

echo "GeoJSON count (hardcoded): ${#EXPECTED_GEOJSON_FILES[@]}"
echo "GeoJSON present in container: ${present_count}"
if [[ "${present_count}" -ne "${#EXPECTED_GEOJSON_FILES[@]}" ]]; then
  echo "[WARN] Some hardcoded GeoJSON files are missing from ${MOUNT_DIR}"
fi

echo
echo "[4/4] Publishing hardcoded GeoJSON files to workspace '${WORKSPACE}'"

if ! docker compose exec -T "${SERVICE_NAME}" sh -c 'mkdir -p "$1"' sh "${IMPORT_DIR}" >/dev/null 2>&1; then
  echo "[FAIL] Could not create import directory: ${IMPORT_DIR}"
  exit 1
fi

for _ in $(seq 1 60); do
  ready_code=$(req GET "${REST_URL}/about/version.json")
  if [[ "${ready_code}" == "200" ]]; then
    break
  fi
  sleep 1
done

if [[ "${ready_code:-}" != "200" ]]; then
  echo "[FAIL] GeoServer REST API not ready at ${REST_URL}"
  exit 1
fi

workspace_code=$(req POST "${REST_URL}/workspaces" "<workspace><name>$(xml_escape "${WORKSPACE}")</name></workspace>")
if [[ "${workspace_code}" == "201" ]]; then
  echo "[OK] Workspace created: ${WORKSPACE}"
elif [[ "${workspace_code}" == "409" ]]; then
  echo "[OK] Workspace already exists: ${WORKSPACE}"
else
  echo "[WARN] Workspace create returned HTTP ${workspace_code}"
fi

published_count=0
existing_count=0
failed_count=0
skipped_missing_count=0

for file_name in "${EXPECTED_GEOJSON_FILES[@]}"; do
  if ! docker compose exec -T "${SERVICE_NAME}" sh -c 'test -f "$1"' sh "${MOUNT_DIR}/${file_name}" >/dev/null 2>&1; then
    skipped_missing_count=$((skipped_missing_count + 1))
    continue
  fi

  native_name="${file_name%.geojson}"
  layer_name="$(sanitize_layer_name "${native_name}")"
  shp_store_name="${layer_name}_shp_ds"
  ogr_store_name="${layer_name}_ogr_ds"
  src_path="${MOUNT_DIR}/${file_name}"
  shp_path="${IMPORT_DIR}/${layer_name}.shp"

  # Convert GeoJSON to shapefile in GeoServer data_dir to avoid OGR rendering issues.
  if ! docker compose exec -T "${SERVICE_NAME}" sh -c '
    set -eu
    src="$1"
    dst="$2"
    base="${dst%.shp}"
    rm -f "${base}.shp" "${base}.shx" "${base}.dbf" "${base}.prj" "${base}.cpg" "${base}.qix"
    ogr2ogr -f "ESRI Shapefile" "${dst}" "${src}" >/tmp/geonex_ogr2ogr.log 2>&1
  ' sh "${src_path}" "${shp_path}" >/dev/null 2>&1; then
    echo "[FAIL] Conversion failed for ${file_name}"
    docker compose exec -T "${SERVICE_NAME}" sh -lc 'tail -n 20 /tmp/geonex_ogr2ogr.log 2>/dev/null || true' || true
    failed_count=$((failed_count + 1))
    continue
  fi

  # Cleanup old OGR store/layer created by previous script versions.
  old_ogr_code=$(req GET "${REST_URL}/workspaces/${WORKSPACE}/datastores/${ogr_store_name}.json")
  if [[ "${old_ogr_code}" == "200" ]]; then
    req DELETE "${REST_URL}/workspaces/${WORKSPACE}/datastores/${ogr_store_name}?recurse=true" >/dev/null || true
  fi

  shp_store_code=$(req GET "${REST_URL}/workspaces/${WORKSPACE}/datastores/${shp_store_name}.json")
  layer_code=$(req GET "${REST_URL}/layers/${WORKSPACE}:${layer_name}.json")

  if [[ "${shp_store_code}" == "200" && "${layer_code}" == "200" ]]; then
    echo "[OK] Layer exists: ${WORKSPACE}:${layer_name}"
    existing_count=$((existing_count + 1))
    continue
  fi

  if [[ "${layer_code}" == "200" && "${shp_store_code}" != "200" ]]; then
    req DELETE "${REST_URL}/layers/${WORKSPACE}:${layer_name}?recurse=true" >/dev/null || true
  fi

  if [[ "${shp_store_code}" == "200" && "${layer_code}" != "200" ]]; then
    req DELETE "${REST_URL}/workspaces/${WORKSPACE}/datastores/${shp_store_name}?recurse=true" >/dev/null || true
  fi

  publish_code=$(req PUT "${REST_URL}/workspaces/${WORKSPACE}/datastores/${shp_store_name}/external.shp?configure=all" "${shp_path}" "text/plain")
  if [[ "${publish_code}" == "200" || "${publish_code}" == "201" ]]; then
    echo "[OK] Layer published: ${WORKSPACE}:${layer_name}"
    published_count=$((published_count + 1))
  else
    echo "[FAIL] Shapefile publish failed for ${file_name} (HTTP ${publish_code})"
    head -c 260 /tmp/geonex_start_rest.out || true
    echo
    failed_count=$((failed_count + 1))
  fi
done

echo "Publish summary: published=${published_count}, existing=${existing_count}, missing=${skipped_missing_count}, failed=${failed_count}"

echo
printf 'GeoServer UI: http://localhost:%s/geoserver/web\n' "${GEOSERVER_PORT:-8080}"
