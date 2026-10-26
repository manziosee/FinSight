# Deploying FinSight to Fly.io

Every service is its own Fly app in one organisation, wired together over Fly's private,
WireGuard-encrypted `*.internal` network (IPv6 — the services bind `::`). Only two apps are
public: **`finsight-api-gateway`** (the API, TLS at Fly's edge) and **`finsight-console`**.

```
Internet ─► finsight-console.fly.dev        (browser UI)
Internet ─► finsight-api-gateway.fly.dev    (the API)
                    │ http://finsight-*.internal:8000
   ┌────────────────┼──────────────────────────────────────────┐
 identity  ingestion  normalization  graph  reconciliation  intelligence/anomaly/forecast/action
   │          │           │            │          │
 Fly Postgres (one DB + one user per service)   Tigris (S3)   finsight-neo4j
        └────── finsight-redpanda (Kafka API) ──────┘     finsight-redis (gateway)
```

| Need | Runs as | Notes |
|---|---|---|
| PostgreSQL | `finsight-pg` (`fly postgres`) | Fly's *unmanaged* Postgres: you own backups/upgrades. `fly mpg` is the managed option. |
| Kafka | `finsight-redpanda` (`infra/redpanda`) | single node, 5 GB volume, private |
| Graph DB | `finsight-neo4j` (`infra/neo4j`) | Neo4j Community, 3 GB volume, private, bolt only |
| Redis | `finsight-redis` (`infra/redis`) | password-protected, no persistence, private |
| Object storage | Tigris bucket | created by `provision.sh` |

## 1. Provision (idempotent)

```bash
fly auth login
cd deploy/fly
./provision.sh      # apps, volumes, Postgres + per-service users, Tigris, generated passwords
./set-secrets.sh    # each app gets only the secrets it needs (from secrets.env, gitignored)
```

`provision.sh` never prints secrets: database URLs go straight into each app's secrets via
`fly postgres attach`, and generated passwords/Tigris keys go into `secrets.env`.
Optional: add `ANTHROPIC_API_KEY` to `secrets.env` and re-run `./set-secrets.sh`.

## 2. Deploy

```bash
./deploy-all.sh     # redpanda, neo4j, redis → identity → data services → stubs → gateway
```

It deploys one machine per app (`--ha=false`) and passes `--no-public-ips` to everything
except the gateway, because `fly deploy` otherwise gives any app with an `[http_service]`
public IPs on first deploy. Migrations run automatically: the four DB-owning services
declare `[deploy] release_command = "alembic … upgrade head"`.

The console has its own build context:

```bash
cd console && fly apps create finsight-console && fly deploy --ha=false
```

## 3. Verify

```bash
FINSIGHT_SEED_CLIENT_SECRET=$(grep ^SEED_CLIENT_SECRET deploy/fly/secrets.env | cut -d= -f2) \
FINSIGHT_BASE_URL=https://finsight-api-gateway.fly.dev ./scripts/smoke-test.sh
```

## CI

`.github/workflows/fly-deploy.yml` redeploys the services after the CI workflow passes on
`main`, once the repo has a `FLY_API_TOKEN` secret (`fly tokens create deploy -x 999999h`).
Infra apps (Redpanda/Neo4j/Redis) are deployed only by `deploy-all.sh`.

## Notes

* Single region (`jnb`) and one machine per app. The Kafka consumers and outbox relays
  are not yet safe to run as multiple replicas, so don't `fly scale count` the data services.
* Back up the Redpanda/Neo4j volumes with `fly volumes snapshots` (daily snapshots are on
  by default, kept 5 days).
