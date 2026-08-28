#!/usr/bin/env bash
# Push the demo invoices + bank statement through the API.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${FINSIGHT_BASE_URL:-http://localhost:8088}"
CLIENT_ID="${FINSIGHT_SEED_CLIENT_ID:-demo-client}"
CLIENT_SECRET="${FINSIGHT_SEED_CLIENT_SECRET:-demo-secret}"

echo "> requesting token from ${BASE}"
TOKEN=$(curl -sf -X POST "${BASE}/v1/auth/token" \
  -d grant_type=client_credentials \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

upload() {
  local file="$1" source="$2"
  echo "> uploading ${file} (source=${source})"
  curl -sf -X POST "${BASE}/v1/data/upload?source=${source}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -F "file=@${file};type=text/csv" | python3 -m json.tool
}

upload scripts/demo-data/invoices.csv erp
upload scripts/demo-data/bank-statement.csv bank

echo
echo "> waiting for async normalization + graph build..."
sleep 6

echo "> running reconciliation"
curl -sf -X POST "${BASE}/v1/reconciliation/run" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"scope":"payment_invoice"}' | python3 -m json.tool
