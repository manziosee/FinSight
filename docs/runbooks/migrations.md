# Runbook — Database migrations

Services owning a DB: `identity-service`, `ingestion-service`, `normalization-service`,
`reconciliation-service`. Each has `alembic.ini` + `migrations/` and its DSN in
`FINSIGHT_<SVC>_DB_DSN`.

## Author a migration
```bash
cd services/<svc>
uv run alembic revision --autogenerate -m "add xyz column"
# review the generated file — autogenerate misses renames, enum changes, data moves
```
Rules:
- Backwards-compatible only (add nullable columns / new tables; no drops in the same release
  as the code that stops using them — do it a release later).
- Large tables: create indexes `CONCURRENTLY` in a separate, non-transactional migration.
- Never edit an applied migration; add a new one.

## Run locally
```bash
make migrate            # all services, inside their containers
# or one service:
docker compose run --rm <svc> alembic -c services/<svc>/alembic.ini upgrade head
```

## Run in an environment
Helm runs them automatically as `pre-install,pre-upgrade` Jobs (`migrations-job.yaml`).
Manual: `kubectl -n finsight create job --from=cronjob/... ` or run the service image with
`command: ["alembic","upgrade","head"]`.

## The `0001_initial` migrations
Bootstrap the current ORM in one step (`Base.metadata.create_all`). Everything after MUST be
explicit `op.*` operations. Dev/test also allow `Database.create_all()` on startup
(disabled when `FINSIGHT_ENV` is staging/production).
