#!/usr/bin/env bash
# Give each Fly app exactly the secrets it needs, from deploy/fly/secrets.env.
# Database DSNs are NOT here: provision.sh's `fly postgres attach` already set them.
set -euo pipefail
cd "$(dirname "$0")"

[ -f secrets.env ] || { echo "run ./provision.sh first (it creates secrets.env)"; exit 1; }
set -a; . ./secrets.env; set +a
for required in NEO4J_PASSWORD REDIS_PASSWORD S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_RAW_BUCKET; do
  [ -n "${!required:-}" ] || { echo "secrets.env: $required is empty — run ./provision.sh"; exit 1; }
done

internal() { echo "http://finsight-$1.internal:8000"; }

KAFKA_COMMON=(
  "FINSIGHT_KAFKA_BOOTSTRAP_SERVERS=finsight-redpanda.internal:9092"
  "FINSIGHT_KAFKA_SECURITY_PROTOCOL=PLAINTEXT"   # inside Fly's WireGuard private network
)
S3_COMMON=(
  "FINSIGHT_S3_ENDPOINT_URL=${S3_ENDPOINT_URL}"
  "FINSIGHT_S3_REGION=${S3_REGION}"
  "FINSIGHT_S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}"
  "FINSIGHT_S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}"
  "FINSIGHT_S3_RAW_BUCKET=${S3_RAW_BUCKET}"
)
JWT_COMMON=(
  "FINSIGHT_JWT_ISSUER=${JWT_ISSUER}"
  "FINSIGHT_JWT_AUDIENCE=${JWT_AUDIENCE}"
  "FINSIGHT_JWKS_URL=$(internal identity-service)/.well-known/jwks.json"
)

set_secrets() { local app="$1"; shift; echo ">> $app"; fly secrets set --stage -a "$app" "$@" >/dev/null; }

# RS256 signing key — generated once so tokens survive restarts / multiple machines.
if [ ! -f jwt-private.pem ]; then
  openssl genrsa -out jwt-private.pem 2048 2>/dev/null
  echo "generated deploy/fly/jwt-private.pem (gitignored)"
fi

set_secrets finsight-neo4j "NEO4J_AUTH=neo4j/${NEO4J_PASSWORD}"
set_secrets finsight-redis "REDIS_PASSWORD=${REDIS_PASSWORD}"

set_secrets finsight-identity-service \
  "FINSIGHT_JWT_PRIVATE_KEY_PEM=$(cat jwt-private.pem)" \
  "FINSIGHT_SEED_CLIENT_ID=${SEED_CLIENT_ID:-}" \
  "FINSIGHT_SEED_CLIENT_SECRET=${SEED_CLIENT_SECRET:-}" \
  "${KAFKA_COMMON[@]}" "${JWT_COMMON[@]}"

set_secrets finsight-ingestion-service     "${KAFKA_COMMON[@]}" "${S3_COMMON[@]}" "${JWT_COMMON[@]}"
set_secrets finsight-normalization-service "${KAFKA_COMMON[@]}" "${S3_COMMON[@]}" "${JWT_COMMON[@]}"
set_secrets finsight-reconciliation-service "${KAFKA_COMMON[@]}" "${JWT_COMMON[@]}"

set_secrets finsight-graph-service \
  "FINSIGHT_NEO4J_URI=bolt://finsight-neo4j.internal:7687" \
  "FINSIGHT_NEO4J_USER=neo4j" \
  "FINSIGHT_NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
  "${KAFKA_COMMON[@]}" "${JWT_COMMON[@]}"

set_secrets finsight-intelligence-service \
  "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}" "FINSIGHT_LLM_PROVIDER=anthropic" \
  "FINSIGHT_RECONCILIATION_URL=$(internal reconciliation-service)" \
  "FINSIGHT_GRAPH_URL=$(internal graph-service)" \
  "${JWT_COMMON[@]}"

for s in anomaly-service forecast-service action-service; do
  set_secrets "finsight-$s" "${KAFKA_COMMON[@]}" "${JWT_COMMON[@]}"
done

set_secrets finsight-api-gateway \
  "FINSIGHT_REDIS_URL=redis://:${REDIS_PASSWORD}@finsight-redis.internal:6379/0" \
  "${JWT_COMMON[@]}"

echo
echo "secrets staged; ./deploy-all.sh applies them."
