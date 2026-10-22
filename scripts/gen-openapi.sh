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
from api_gateway.openapi import merge_openapi_specs

out_dir, *modules = sys.argv[1:]
specs = {}
for mod in modules:
    app = importlib.import_module(f"{mod}.main").app
    spec = app.openapi()
    with open(f"{out_dir}/{mod}.openapi.json", "w") as fh:
        json.dump(spec, fh, indent=2)
    specs[mod.removesuffix("_service")] = spec

merged = merge_openapi_specs(specs)

with open(f"{out_dir}/finsight.openapi.json", "w") as fh:
    json.dump(merged, fh, indent=2)
print(f"wrote {out_dir}/finsight.openapi.json with {len(merged['paths'])} paths")
EOF
