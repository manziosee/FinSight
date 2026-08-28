#!/usr/bin/env bash
# Deploy every FinSight service to Fly in dependency order. Run from anywhere.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

FLAGS="${FLY_DEPLOY_FLAGS:---remote-only}"

deploy() {
  local svc="$1"
  echo "=================  finsight-$svc  ================="
  fly deploy --config "deploy/fly/${svc}.toml" $FLAGS
}

# 1. identity first (issues the JWTs everything else verifies)
deploy identity-service

# 2. data-plane services (Kafka consumers + producers)
for s in ingestion-service normalization-service graph-service reconciliation-service; do
  deploy "$s"
done

# 3. stateless intelligence/action stubs
for s in intelligence-service anomaly-service forecast-service action-service; do
  deploy "$s"
done

# 4. gateway last (needs the upstreams reachable)
deploy api-gateway

cat <<'DONE'

All services deployed. If this is the first deploy, also run:
  fly ips allocate-v4 --shared -a finsight-api-gateway
  fly ips allocate-v6 -a finsight-api-gateway
  # then the migrations (README §5) and:
  FINSIGHT_BASE_URL=https://finsight-api-gateway.fly.dev ./scripts/smoke-test.sh
DONE
