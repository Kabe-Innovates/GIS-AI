#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

BASE_URL="${BASE_URL:-http://localhost:${GEOSERVER_PORT:-8080}/geoserver}"
REST_URL="${BASE_URL}/rest"
WORKSPACE="${GEOSERVER_WORKSPACE:-geonex}"
STORE_NAME="${GEOSERVER_STORE:-accidents_tn}"
USER_NAME="${GEOSERVER_ADMIN_USER:-admin}"
PASSWORD="${GEOSERVER_ADMIN_PASSWORD:-geoserver}"

GEOJSON_PATH="${GEOJSON_PATH:-/mnt/data-samples/Accidents_TN.geojson}"
SHP_PATH="${SHP_PATH:-/mnt/data-samples/tamilnadu_accident_testdata_shapefile/tn_accidents_500.shp}"

auth="${USER_NAME}:${PASSWORD}"

req() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local content_type="${4:-text/plain}"

  if [[ -n "${body}" ]]; then
    curl -sS -o /tmp/geonex_rest.out -w "%{http_code}" -u "${auth}" -X"${method}" \
      -H "Content-Type: ${content_type}" --data "${body}" "${url}"
  else
    curl -sS -o /tmp/geonex_rest.out -w "%{http_code}" -u "${auth}" -X"${method}" "${url}"
  fi
}

echo "[1/4] Ensuring workspace '${WORKSPACE}' exists"
code=$(req POST "${REST_URL}/workspaces" "<workspace><name>${WORKSPACE}</name></workspace>" "text/xml")
if [[ "${code}" == "201" ]]; then
  echo "[OK] Workspace created"
elif [[ "${code}" == "409" ]]; then
  echo "[OK] Workspace already exists"
else
  echo "[WARN] Workspace create returned HTTP ${code}"
  head -c 300 /tmp/geonex_rest.out || true
  echo
fi

# Idempotent fast path: if fallback-published layer already exists, skip publish.
existing_code=$(req GET "${REST_URL}/workspaces/${WORKSPACE}/datastores/${STORE_NAME}/featuretypes/tn_accidents_500.json")
if [[ "${existing_code}" == "200" ]]; then
  layer_name="tn_accidents_500"
  echo "[OK] Existing layer detected: ${WORKSPACE}:${layer_name}"
  echo "[4/4] Validating WMS/WFS endpoints"
  "${ROOT_DIR}/scripts/validate_endpoints.sh" "${BASE_URL}" "${USER_NAME}" "${PASSWORD}" "${WORKSPACE}" "${layer_name}"
  echo
  echo "Publish complete (reused existing layer)."
  echo "Workspace : ${WORKSPACE}"
  echo "Store     : ${STORE_NAME}"
  echo "Layer     : ${layer_name}"
  exit 0
fi

echo "[2/4] Trying GeoJSON publish (preferred)"
code=$(req PUT "${REST_URL}/workspaces/${WORKSPACE}/datastores/${STORE_NAME}/external.geojson?configure=all" "${GEOJSON_PATH}")
if [[ "${code}" == "200" || "${code}" == "201" ]]; then
  layer_name="Accidents_TN"
  echo "[OK] GeoJSON publish succeeded"
else
  echo "[WARN] GeoJSON publish failed with HTTP ${code}; switching to shapefile fallback"
  head -c 300 /tmp/geonex_rest.out || true
  echo

  echo "[3/4] Publishing shapefile fallback"
  code=$(req PUT "${REST_URL}/workspaces/${WORKSPACE}/datastores/${STORE_NAME}/external.shp?configure=all" "${SHP_PATH}")
  if [[ "${code}" == "200" || "${code}" == "201" ]]; then
    layer_name="tn_accidents_500"
    echo "[OK] Shapefile fallback publish succeeded"
  else
    existing_code=$(req GET "${REST_URL}/workspaces/${WORKSPACE}/datastores/${STORE_NAME}/featuretypes/tn_accidents_500.json")
    if [[ "${existing_code}" == "200" ]]; then
      layer_name="tn_accidents_500"
      echo "[OK] Shapefile layer already exists; reusing published layer"
    else
      echo "[FAIL] Shapefile fallback publish failed with HTTP ${code}"
      head -c 500 /tmp/geonex_rest.out || true
      echo
      exit 1
    fi
  fi
fi

echo "[4/4] Validating WMS/WFS endpoints"
"${ROOT_DIR}/scripts/validate_endpoints.sh" "${BASE_URL}" "${USER_NAME}" "${PASSWORD}" "${WORKSPACE}" "${layer_name}"

echo
echo "Publish complete."
echo "Workspace : ${WORKSPACE}"
echo "Store     : ${STORE_NAME}"
echo "Layer     : ${layer_name}"
