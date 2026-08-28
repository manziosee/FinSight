#!/usr/bin/env bash
# Create the Fly apps + the managed resources flyctl can create.
# Upstash Kafka and Neo4j Aura must be created in their web consoles (see README).
set -euo pipefail
cd "$(dirname "$0")"

REGION="${FLY_REGION:-jnb}"
ORG="${FLY_ORG:-personal}"

SERVICES=(api-gateway identity-service ingestion-service normalization-service graph-service
          reconciliation-service intelligence-service anomaly-service forecast-service action-service)

echo ">> creating apps in org=$ORG"
for s in "${SERVICES[@]}"; do
  fly apps create "finsight-$s" --org "$ORG" 2>/dev/null && echo "  created finsight-$s" \
    || echo "  finsight-$s already exists"
done

echo
echo ">> Postgres cluster"
if ! fly postgres list 2>/dev/null | grep -q finsight-pg; then
  fly postgres create --name finsight-pg --org "$ORG" --region "$REGION" \
    --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 3
fi
echo ">> creating databases"
for db in identity ingestion normalization reconciliation; do
  fly postgres db create finsight-pg --name "$db" 2>/dev/null && echo "  db $db" || echo "  db $db exists"
done

echo
echo ">> Redis (Upstash via Fly)"
fly redis create --name finsight-redis --org "$ORG" --region "$REGION" --no-replicas --enable-eviction 2>/dev/null \
  || echo "  finsight-redis already exists — run: fly redis status finsight-redis"

echo
echo ">> Tigris object storage (attached to the ingestion app)"
fly storage create --name finsight-raw --app finsight-ingestion-service 2>/dev/null \
  || echo "  bucket exists — run: fly storage list"

cat <<'NEXT'

------------------------------------------------------------------------
Next, in the browser:
  1. Upstash Kafka  (console.upstash.com) — create a cluster + the 7 topics (README §1)
  2. Neo4j Aura Free (console.neo4j.io)   — create an instance, save the credentials

Then:
  cp secrets.env.example secrets.env && $EDITOR secrets.env
  ./set-secrets.sh
  ./deploy-all.sh
------------------------------------------------------------------------
NEXT
