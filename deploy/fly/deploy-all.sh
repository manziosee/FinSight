#!/usr/bin/env bash
# Deploy FinSight to Fly in dependency order. Run from anywhere.
# One machine per app (--ha=false): consumers/outbox relays are not yet safe to run
# replicated (see the outbox locking issue), and it keeps cost down.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

FLAGS="${FLY_DEPLOY_FLAGS:---remote-only --ha=false}"

deploy_infra() {  # private infra app, own build context
  echo "=================  finsight-$1  ================="
  fly deploy "$ROOT/deploy/fly/infra/$1" --config "$ROOT/deploy/fly/infra/$1/fly.toml" $FLAGS --no-public-ips
}
deploy_svc() {    # python service, repo-root build context
  local svc="$1"; shift
  echo "=================  finsight-$svc  ================="
  fly deploy "$ROOT" --config "$ROOT/deploy/fly/${svc}.toml" $FLAGS "$@"
}

# 0. infra the services connect to at startup (SKIP_INFRA=1 to redeploy services only)
if [ -z "${SKIP_INFRA:-}" ]; then
  for i in redpanda neo4j redis; do deploy_infra "$i"; done
fi

# 1. identity first (issues the JWTs everything else verifies)
deploy_svc identity-service --no-public-ips

# 2. data-plane services (Kafka consumers + producers)
for s in ingestion-service normalization-service graph-service reconciliation-service; do
  deploy_svc "$s" --no-public-ips
done

# 3. intelligence + stubs
for s in intelligence-service anomaly-service forecast-service action-service; do
  deploy_svc "$s" --no-public-ips
done

# 4. gateway last — the only public API app (Fly allocates its public IPs)
deploy_svc api-gateway

cat <<'DONE'

All services deployed. Smoke test:
  FINSIGHT_SEED_CLIENT_SECRET=$(grep ^SEED_CLIENT_SECRET deploy/fly/secrets.env | cut -d= -f2) \
  FINSIGHT_BASE_URL=https://finsight-api-gateway.fly.dev ./scripts/smoke-test.sh
Console (own build context):
  cd console && fly deploy --ha=false
DONE
