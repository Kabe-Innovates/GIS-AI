# GeoServer Setup (GeoNex)

This folder contains a local Docker setup for GeoServer and validation scripts for your Tamil Nadu accidents layer.

## 1) Start GeoServer

```bash
cd geoserver
cp .env.example .env
# Edit .env and set a strong GEOSERVER_ADMIN_PASSWORD
chmod +x scripts/start_geoserver.sh
./scripts/start_geoserver.sh
```

Open: `http://localhost:8080/geoserver/web`

The startup wrapper prints a hardcoded list of expected `.geojson` files, checks each file exists at `/mnt/data-samples`, converts each present file to a shapefile under GeoServer `data_dir`, and publishes the converted data as layers in workspace `geonex`.

Auto-published hardcoded layers:
- `geonex:accidents_tn`
- `geonex:tamil__nadu__district__hq`
- `geonex:tamil__nadu__sub__district__hq`
- `geonex:tamil__nadu__villages`
- `geonex:tamil__nadu_assembly`
- `geonex:tamil__nadu_districts`
- `geonex:tamil__nadu_state`
- `geonex:tamil__nadu_villages`
- `geonex:tamil__nadu_parliament`
- `geonex:tamilnadu_subdistricts`

## 2) Publish Dataset in UI

Use `Data Samples/Accidents_TN.geojson` first. If GeoJSON datastore is unavailable in your image, use the shapefile fallback.

1. Create workspace: `geonex`
2. Add store:
   - Preferred: GeoJSON store with file path `/mnt/data-samples/Accidents_TN.geojson`
   - Fallback: Shapefile store with file path `/mnt/data-samples/tamilnadu_accident_testdata_shapefile/tn_accidents_500.shp`
3. Publish feature type as `tn_accidents_500` (or `Accidents_TN` if GeoJSON publish is supported in your GeoServer image)
4. Confirm geometry is Point and CRS is `EPSG:4326` (or CRS84 equivalent)
5. Save layer and check Layer Preview

Optional automated publish (recommended):

```bash
cd geoserver
chmod +x scripts/publish_accidents_layer.sh scripts/validate_endpoints.sh
./scripts/publish_accidents_layer.sh
```

The script attempts GeoJSON first and falls back to shapefile if GeoJSON store support is missing.

## 3) Create Read-Only App User

1. Create role: `APP_READONLY`
2. Create user: `app_reader`
3. Assign `APP_READONLY` to `app_reader`
4. Grant read access to WMS/WFS and the `geonex:tn_accidents_500` layer

## 4) Validate Endpoints

```bash
cd geoserver
chmod +x scripts/validate_endpoints.sh
./scripts/validate_endpoints.sh \
  "http://localhost:8080/geoserver" \
  "admin" \
  "<admin-password>" \
  "geonex" \
  "tn_accidents_500"
```

The script verifies:
- WMS GetCapabilities
- WFS GetCapabilities
- WMS GetMap
- WFS GetFeature

## 5) Known-Good Endpoint Templates

- WMS Capabilities:
  - `http://localhost:8080/geoserver/wms?service=WMS&request=GetCapabilities`
- WFS Capabilities:
  - `http://localhost:8080/geoserver/wfs?service=WFS&request=GetCapabilities`
- WFS GetFeature (GeoJSON):
  - `http://localhost:8080/geoserver/geonex/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=geonex:tn_accidents_500&outputFormat=application/json`

## 6) Stop / Restart

```bash
cd geoserver
docker compose stop
docker compose start
```

Or fully tear down container (preserves data_dir volume files):

```bash
cd geoserver
docker compose down
```
