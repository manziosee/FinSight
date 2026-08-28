#!/usr/bin/env bash
# Extract each service's OpenAPI schema (offline, no running stack) and merge them
# into docs/api/finsight.openapi.json for the docs site and contract tests.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=docs/api
mkdir -p "$OUT"

SERVICES=(identity_service ingestion_service normalization_service graph_service
          reconciliation_service intelligence_service anomaly_service forecast_service
          action_service api_gateway)

export FINSIGHT_OTEL_EXPORTER_OTLP_ENDPOINT=""
export FINSIGHT_ENV="test"

uv run --python 3.12 python - "$OUT" "${SERVICES[@]}" <<'EOF'
import importlib, json, sys

out_dir, *modules = sys.argv[1:]
merged = {
    "openapi": "3.1.0",
    "info": {"title": "FinSight API", "version": "v1",
             "description": "Unified financial intelligence API (generated)."},
    "paths": {}, "components": {"schemas": {}},
}
for mod in modules:
    app = importlib.import_module(f"{mod}.main").app
    spec = app.openapi()
    with open(f"{out_dir}/{mod}.openapi.json", "w") as fh:
        json.dump(spec, fh, indent=2)
    for path, item in spec.get("paths", {}).items():
        if path.startswith(("/v1/", "/.well-known/")):
            merged["paths"].setdefault(path, {}).update(item)
    for name, schema in spec.get("components", {}).get("schemas", {}).items():
        merged["components"]["schemas"].setdefault(name, schema)

with open(f"{out_dir}/finsight.openapi.json", "w") as fh:
    json.dump(merged, fh, indent=2)
print(f"wrote {out_dir}/finsight.openapi.json with {len(merged['paths'])} paths")
EOF
