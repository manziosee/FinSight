#!/usr/bin/env bash
# Create every Fly resource FinSight needs. Idempotent: safe to re-run.
#   * one app per service + private infra apps (Redpanda, Neo4j, Redis)
#   * volumes for Redpanda and Neo4j
#   * a Fly Postgres cluster, with a database AND a dedicated user per service
#     (`fly postgres attach` stores each DSN directly in that app's secrets)
#   * a Tigris bucket for raw uploads
#   * generated passwords in secrets.env (never printed)
set -euo pipefail
cd "$(dirname "$0")"

REGION="${FLY_REGION:-jnb}"
ORG="${FLY_ORG:-personal}"
PG_APP="${FLY_PG_APP:-finsight-pg}"

SERVICES=(api-gateway identity-service ingestion-service normalization-service graph-service
          reconciliation-service intelligence-service anomaly-service forecast-service action-service)
INFRA=(redpanda neo4j redis)

mask() { sed -E 's#(://[^:/@]+:)[^@]+@#\1****@#g; s#(Password|PASSWORD|SECRET[A-Z_]*|AWS_SECRET_ACCESS_KEY)([:=] *)[^ ]+#\1\2****#g'; }
app_exists() { fly status -a "$1" >/dev/null 2>&1 || fly apps list 2>/dev/null | grep -qw "$1"; }

echo ">> apps (org=$ORG)"
for name in "${SERVICES[@]}" "${INFRA[@]}"; do
  app="finsight-$name"
  if app_exists "$app"; then echo "  $app exists"; else fly apps create "$app" --org "$ORG" >/dev/null && echo "  created $app"; fi
done

echo ">> volumes"
ensure_volume() {  # app volume size_gb
  if fly volumes list -a "$1" 2>/dev/null | grep -qw "$2"; then echo "  $1/$2 exists"
  else fly volumes create "$2" -a "$1" -r "$REGION" -s "$3" -y >/dev/null && echo "  created $1/$2 (${3}GB)"; fi
}
ensure_volume finsight-redpanda redpanda_data 5
ensure_volume finsight-neo4j neo4j_data 3

echo ">> postgres ($PG_APP)"
if app_exists "$PG_APP"; then echo "  $PG_APP exists"
else
  # Output includes the superuser password; mask it. Services never use that user.
  fly postgres create --name "$PG_APP" --org "$ORG" --region "$REGION" \
    --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 3 2>&1 | mask
fi

echo ">> per-service databases + users"
attach() {  # service db VAR
  local app="finsight-$1"
  if fly secrets list -a "$app" 2>/dev/null | grep -qw "$3"; then echo "  $app: $3 already set"; return; fi
  fly postgres attach "$PG_APP" -a "$app" --database-name "$2" --database-user "${2}_svc" \
    --variable-name "$3" --yes 2>&1 | mask
}
attach identity-service       identity       FINSIGHT_IDENTITY_DB_DSN
attach ingestion-service      ingestion      FINSIGHT_INGESTION_DB_DSN
attach normalization-service  normalization  FINSIGHT_NORMALIZATION_DB_DSN
attach reconciliation-service reconciliation FINSIGHT_RECONCILIATION_DB_DSN

echo ">> secrets.env"
[ -f secrets.env ] || { cp secrets.env.example secrets.env; echo "  created secrets.env"; }
setvar() {  # KEY VALUE — set only if currently empty/missing
  if grep -qE "^$1=.+" secrets.env; then return 1; fi
  if grep -qE "^$1=" secrets.env; then sed -i.bak "s|^$1=.*|$1=$2|" secrets.env && rm -f secrets.env.bak
  else printf '%s=%s\n' "$1" "$2" >> secrets.env; fi
}
for key in NEO4J_PASSWORD REDIS_PASSWORD; do
  setvar "$key" "$(openssl rand -hex 24)" && echo "  generated $key"
done
if grep -qE "^SEED_CLIENT_ID=.+" secrets.env; then
  setvar SEED_CLIENT_SECRET "$(openssl rand -hex 32)" && echo "  generated SEED_CLIENT_SECRET"
fi

echo ">> tigris bucket"
if grep -qE "^S3_ACCESS_KEY_ID=.+" secrets.env; then echo "  already in secrets.env"
else
  BUCKET="finsight-raw-$(openssl rand -hex 4)"
  OUT="$(fly storage create --org "$ORG" --name "$BUCKET" --yes 2>&1)" || { echo "$OUT" | mask; exit 1; }
  get() { echo "$OUT" | grep -oE "$1[:=] *[^ ]+" | head -1 | sed -E "s/^$1[:=] *//"; }
  KEY_ID="$(get AWS_ACCESS_KEY_ID)"; SECRET="$(get AWS_SECRET_ACCESS_KEY)"
  NAME="$(get BUCKET_NAME)"; ENDPOINT="$(get AWS_ENDPOINT_URL_S3)"
  if [ -z "$KEY_ID" ] || [ -z "$SECRET" ]; then
    echo "  could not parse credentials from 'fly storage create' output:"; echo "$OUT" | mask; exit 1
  fi
  sed -i.bak -e "s|^S3_ACCESS_KEY_ID=.*|S3_ACCESS_KEY_ID=${KEY_ID}|" \
             -e "s|^S3_SECRET_ACCESS_KEY=.*|S3_SECRET_ACCESS_KEY=${SECRET}|" \
             -e "s|^S3_RAW_BUCKET=.*|S3_RAW_BUCKET=${NAME:-$BUCKET}|" secrets.env && rm -f secrets.env.bak
  [ -n "$ENDPOINT" ] && sed -i.bak "s|^S3_ENDPOINT_URL=.*|S3_ENDPOINT_URL=${ENDPOINT}|" secrets.env && rm -f secrets.env.bak
  echo "  created bucket ${NAME:-$BUCKET}; credentials saved to secrets.env"
fi

cat <<'NEXT'

Provisioned. Next:
  ./set-secrets.sh     # fan secrets out to each app
  ./deploy-all.sh      # infra → identity → data services → stubs → gateway
NEXT
