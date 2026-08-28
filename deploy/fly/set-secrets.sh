#!/usr/bin/env bash
# Fan secrets out to each Fly app. Reads deploy/fly/secrets.env.
set -euo pipefail
cd "$(dirname "$0")"

[ -f secrets.env ] || { echo "create secrets.env from secrets.env.example first"; exit 1; }
set -a; . ./secrets.env; set +a

dsn() { echo "postgresql+asyncpg://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/$1"; }

KAFKA_COMMON=(
  "FINSIGHT_KAFKA_BOOTSTRAP_SERVERS=${KAFKA_BOOTSTRAP}"
  "FINSIGHT_KAFKA_SECURITY_PROTOCOL=SASL_SSL"
  "FINSIGHT_KAFKA_SASL_MECHANISM=${KAFKA_SASL_MECHANISM}"
  "FINSIGHT_KAFKA_SASL_USERNAME=${KAFKA_USERNAME}"
  "FINSIGHT_KAFKA_SASL_PASSWORD=${KAFKA_PASSWORD}"
  "FINSIGHT_KAFKA_ENABLE_IDEMPOTENCE=false"
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
  "FINSIGHT_REDIS_URL=${REDIS_URL}"
  "FINSIGHT_FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY}"
)

set_secrets() { local app="$1"; shift; echo ">> $app"; fly secrets set --stage -a "$app" "$@"; }

# RS256 signing key — generated once so tokens survive restarts / multiple machines.
if [ ! -f jwt-private.pem ]; then
  openssl genrsa -out jwt-private.pem 2048 2>/dev/null
  echo "generated deploy/fly/jwt-private.pem (gitignored)"
fi
JWT_PEM="$(cat jwt-private.pem)"

set_secrets finsight-identity-service \
  "FINSIGHT_IDENTITY_DB_DSN=$(dsn identity)" \
  "FINSIGHT_JWT_PRIVATE_KEY_PEM=${JWT_PEM}" \
  "FINSIGHT_SEED_CLIENT_ID=${SEED_CLIENT_ID}" \
  "FINSIGHT_SEED_CLIENT_SECRET=${SEED_CLIENT_SECRET}" \
  "${JWT_COMMON[@]}"

set_secrets finsight-ingestion-service \
  "FINSIGHT_INGESTION_DB_DSN=$(dsn ingestion)" "${KAFKA_COMMON[@]}" "${S3_COMMON[@]}" "${JWT_COMMON[@]}"

set_secrets finsight-normalization-service \
  "FINSIGHT_NORMALIZATION_DB_DSN=$(dsn normalization)" "${KAFKA_COMMON[@]}" "${S3_COMMON[@]}" "${JWT_COMMON[@]}"

set_secrets finsight-reconciliation-service \
  "FINSIGHT_RECONCILIATION_DB_DSN=$(dsn reconciliation)" "${KAFKA_COMMON[@]}" "${JWT_COMMON[@]}"

set_secrets finsight-graph-service \
  "FINSIGHT_NEO4J_URI=${NEO4J_URI}" \
  "FINSIGHT_NEO4J_USER=${NEO4J_USER}" \
  "FINSIGHT_NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
  "${KAFKA_COMMON[@]}" "${JWT_COMMON[@]}"

set_secrets finsight-intelligence-service \
  "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}" "FINSIGHT_LLM_PROVIDER=anthropic" "${JWT_COMMON[@]}"

for s in anomaly-service forecast-service action-service; do
  set_secrets "finsight-$s" "${JWT_COMMON[@]}"
done

set_secrets finsight-api-gateway "${JWT_COMMON[@]}"

echo
echo "secrets staged. deploy applies them: ./deploy-all.sh"
