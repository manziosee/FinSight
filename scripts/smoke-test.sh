#!/usr/bin/env bash
# End-to-end smoke test. Exits non-zero on any failed assertion.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${FINSIGHT_BASE_URL:-http://localhost:8088}"
CLIENT_ID="${FINSIGHT_SEED_CLIENT_ID:-demo-client}"
CLIENT_SECRET="${FINSIGHT_SEED_CLIENT_SECRET:-demo-secret}"
PY=python3

fail() { echo "SMOKE FAIL: $1" >&2; exit 1; }
pass() { echo "  ok - $1"; }

echo "[1/6] gateway health"
curl -sf "${BASE}/health" >/dev/null || fail "gateway /health"
pass "gateway healthy"

echo "[2/6] obtain token"
TOKEN=$(curl -sf -X POST "${BASE}/v1/auth/token" \
  -d grant_type=client_credentials -d "client_id=${CLIENT_ID}" -d "client_secret=${CLIENT_SECRET}" \
  | $PY -c "import sys,json;print(json.load(sys.stdin)['access_token'])") || fail "token request"
[ -n "$TOKEN" ] || fail "empty token"
pass "token issued"

echo "[3/6] aggregated OpenAPI"
PATHS=$(curl -sf "${BASE}/openapi.json" | $PY -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('paths',{})))")
[ "${PATHS:-0}" -ge 5 ] || fail "aggregated spec has too few paths ($PATHS)"
pass "aggregated spec exposes $PATHS paths"

echo "[4/7] upload demo data"
INVOICE_INGESTION=$(curl -sf -X POST "${BASE}/v1/data/upload?source=erp" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@scripts/demo-data/invoices.csv;type=text/csv") || fail "invoice upload"
BANK_INGESTION=$(curl -sf -X POST "${BASE}/v1/data/upload?source=bank" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@scripts/demo-data/bank-statement.csv;type=text/csv") || fail "bank upload"
INVOICE_ID=$(echo "$INVOICE_INGESTION" | $PY -c "import sys,json;print(json.load(sys.stdin)['ingestion_id'])")
BANK_ID=$(echo "$BANK_INGESTION" | $PY -c "import sys,json;print(json.load(sys.stdin)['ingestion_id'])")
pass "uploads accepted (202)"

echo "[5/7] poll ingestion status"
for ingestion_id in "$INVOICE_ID" "$BANK_ID"; do
  STATUS="received"
  for attempt in $(seq 1 30); do
    RESPONSE=$(curl -sf "${BASE}/v1/data/ingestions/${ingestion_id}" \
      -H "Authorization: Bearer ${TOKEN}") || fail "ingestion status lookup"
    STATUS=$(echo "$RESPONSE" | $PY -c "import sys,json;print(json.load(sys.stdin)['status'])")
    [ "$STATUS" = "completed" ] && break
    [ "$STATUS" = "failed" ] && fail "normalization failed: $RESPONSE"
    sleep 2
  done
  [ "$STATUS" = "completed" ] || fail "ingestion did not complete: $ingestion_id"
done
pass "both ingestions completed"

echo "[6/7] reconcile uploaded records"
RESULT=""
for attempt in $(seq 1 12); do
  RESULT=$(curl -s -X POST "${BASE}/v1/reconciliation/run" -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" -d '{"scope":"payment_invoice"}')
  MATCHED=$(echo "$RESULT" | $PY -c "import sys,json;print(json.load(sys.stdin).get('matched',0))" 2>/dev/null || echo 0)
  [ "${MATCHED:-0}" -ge 1 ] && break
  echo "  ...attempt ${attempt}: matched=${MATCHED:-0}"
done
RESULT="$RESULT" $PY - <<'EOF' || exit 1
import json, os
d = json.loads(os.environ["RESULT"] or "{}")
matches = d.get("matches", [])
assert d.get("matched", 0) >= 1, f"expected >=1 match, got {d.get('matched')}: {d}"
strong = [m for m in matches if m["confidence"] > 0.8 and m["explanation"]]
assert strong, f"no high-confidence explained match: {matches}"
print(f"  ok - {len(matches)} matches, best confidence {max(m['confidence'] for m in matches):.2f}")
EOF

echo "[7/7] graph entity lookup"
curl -sf "${BASE}/v1/graph/entities/cust_abc?depth=3" -H "Authorization: Bearer ${TOKEN}" \
  | $PY -c "import sys,json;d=json.load(sys.stdin);print('  ok - connected nodes:', len(d.get('connected',[])))" \
  || echo "  warn - graph lookup returned no data (non-fatal in CI without neo4j warmup)"

echo "SMOKE PASS"
