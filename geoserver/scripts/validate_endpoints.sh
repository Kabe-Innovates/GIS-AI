#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8080/geoserver}"
USER_NAME="${2:-admin}"
PASSWORD="${3:-geoserver}"
WORKSPACE="${4:-geonex}"
LAYER="${5:-tn_accidents_500}"

WMS_CAPS="${BASE_URL}/wms?service=WMS&request=GetCapabilities"
WFS_CAPS="${BASE_URL}/wfs?service=WFS&request=GetCapabilities"
WFS_FEATURES="${BASE_URL}/${WORKSPACE}/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${WORKSPACE}:${LAYER}&outputFormat=application/json"
WMS_MAP="${BASE_URL}/wms?service=WMS&version=1.1.0&request=GetMap&layers=${WORKSPACE}:${LAYER}&styles=&bbox=76,8,80.5,13.5&width=768&height=768&srs=EPSG:4326&format=image/png"

check_status() {
  local label="$1"
  local url="$2"

  local code
  code=$(curl -sS -u "${USER_NAME}:${PASSWORD}" -o /tmp/geonex_check.out -w "%{http_code}" "${url}")
  if [[ "${code}" != "200" ]]; then
    echo "[FAIL] ${label}: HTTP ${code}"
    echo "URL: ${url}"
    echo "Response excerpt:"
    head -c 500 /tmp/geonex_check.out || true
    echo
    return 1
  fi

  echo "[OK] ${label}: HTTP ${code}"
}

echo "Validating GeoServer endpoints"
echo "Base URL : ${BASE_URL}"
echo "Workspace: ${WORKSPACE}"
echo "Layer    : ${LAYER}"

echo
check_status "WMS GetCapabilities" "${WMS_CAPS}"
check_status "WFS GetCapabilities" "${WFS_CAPS}"
check_status "WMS GetMap" "${WMS_MAP}"
check_status "WFS GetFeature" "${WFS_FEATURES}"

if ! grep -q '"acc_id"' /tmp/geonex_check.out; then
  echo "[WARN] WFS response does not include expected field: acc_id"
else
  echo "[OK] WFS payload contains expected field: acc_id"
fi

if ! grep -q '"severity"' /tmp/geonex_check.out; then
  echo "[WARN] WFS response does not include expected field: severity"
else
  echo "[OK] WFS payload contains expected field: severity"
fi

echo
echo "Endpoint validation finished."
