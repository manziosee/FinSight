# Deploying FinSight to Fly.io

Each service is its own Fly app on one organisation, wired together over Fly's private
`*.internal` network. Two apps are public: **`finsight-api-gateway`** (TLS edge, the only
way in to the API) and **`finsight-console`** (the reference UI, calls the gateway from
the browser).

```
Internet ─► finsight-console.fly.dev  (browser UI)
Internet ─► finsight-api-gateway.fly.dev  (TLS, the API)
                    │  http://finsight-*.internal:8000
   ┌────────────────┼───────────────────────────────┐
 identity   ingestion  normalization  graph  reconciliation  intelligence/anomaly/forecast/action
   │           │            │           │          │
 Fly Postgres  Tigris(S3)   Tigris      Neo4j Aura  Fly Postgres
        └────────── Upstash Kafka ──────────┘   Upstash Redis
```

Managed dependencies (all have free tiers):

| Need | Provider | How |
|---|---|---|
| PostgreSQL | Fly Postgres | `fly postgres create` |
| Redis | Fly Redis (Upstash) | `fly redis create` |
| Object storage (S3) | Fly Tigris | `fly storage create` |
| Kafka | Upstash Kafka | console.upstash.com → Kafka |
| Graph DB | Neo4j Aura Free | console.neo4j.io |

## 0. Prerequisites

```bash
curl -L https://fly.io/install.sh | sh          # installs flyctl
fly auth login
fly orgs list                                    # note your org slug
```

App names in the `*.toml` files are `finsight-<service>`. If any is taken globally,
`sed -i 's/finsight-/finsight-<yourprefix>-/' deploy/fly/*.toml` and update
`api-gateway.toml`'s `FINSIGHT_*_URL` values to match.

## 1. Provision infrastructure

```bash
cd deploy/fly
./provision.sh                # creates apps, Postgres, Redis, Tigris; prints next steps
```

Then, in the browser (these have no CLI):

* **Upstash Kafka** — create a cluster in a region near `jnb`, single-zone, then create topics
  (7): `finsight.ingestion.data-ingested.v1`, `finsight.normalization.transaction-normalized.v1`,
  `finsight.graph.graph-updated.v1`, `finsight.reconciliation.completed.v1`,
  `finsight.anomaly.detected.v1`, `finsight.audit.recorded.v1` (1 partition each is fine).
  Copy the **bootstrap endpoint**, **username**, **password** (SASL mechanism `SCRAM-SHA-256`).
* **Neo4j Aura Free** — create an instance, download the credentials
  (`neo4j+s://xxxx.databases.neo4j.io`, user `neo4j`, generated password).

## 2. Set secrets

Fill in `secrets.env` (copy from `secrets.env.example`) and run:

```bash
./set-secrets.sh
```

This fans the right subset of secrets out to each app. It also generates and sets the
RS256 JWT signing key on `finsight-identity-service` so tokens survive restarts.

## 3. Deploy

```bash
./deploy-all.sh               # identity → data services → stubs → gateway (dependency order)
fly ips allocate-v4 --shared -a finsight-api-gateway
fly ips allocate-v6 -a finsight-api-gateway

# The console is self-contained (its own Dockerfile + build context) — deploy it
# separately, from its own directory:
cd ../../console
fly apps create finsight-console --org <your-org> 2>/dev/null || true
fly deploy   # NEXT_PUBLIC_FINSIGHT_API_URL in console/fly.toml must match your gateway URL
fly ips allocate-v4 --shared -a finsight-console
fly ips allocate-v6 -a finsight-console
```

## 4. Verify

```bash
export FINSIGHT_BASE_URL="https://finsight-api-gateway.fly.dev"
../../scripts/smoke-test.sh
```

You should see `SMOKE PASS`: token → upload → normalize → graph → reconcile with matches.

## 5. Migrations

Automatic: the four DB-owning services declare `[deploy] release_command = "alembic … upgrade head"`
in their `fly.toml`, so every `fly deploy` runs pending migrations in a release machine
**before** the new version takes traffic. Nothing to do manually.

## CI

`.github/workflows/fly-deploy.yml` redeploys changed services on push to `main` once you add a
`FLY_API_TOKEN` repo secret (`fly tokens create deploy -x 999999h`). Without the secret it no-ops.

## Costs & notes

* Stateless stubs (`intelligence/anomaly/forecast/action`) `auto_stop` to zero when idle.
* Data/consumer services keep `min_machines_running = 1` (they hold Kafka consumers / the outbox relay).
* `shared-cpu-1x / 512MB` per machine. Neo4j Aura Free pauses after 3 days idle — fine for a demo.
* Everything is single-region (`jnb`); add `fly scale count 2 --region <r>` later for HA.
