# Contributing to FinSight

## Setup

```bash
git clone <repo> && cd FinSight
make bootstrap
uv sync --all-packages          # or: make install
uv run pre-commit install && uv run pre-commit install --hook-type commit-msg
make up                          # full local stack
make smoke                       # verify end-to-end
```

Requires: Docker + Docker Compose, `uv`, Python 3.12.

## Repo layout

```
libs/finsight-common/   shared: config, logging, telemetry, auth, errors, schemas, events, messaging, db
services/<name>/         one FastAPI app each — src/<pkg>/{main,config,api,domain,adapters}, migrations/, tests/
deploy/                  helm/ · k8s/ (kustomize) · terraform/ (AWS)
gateway/traefik/         edge config
infra/                   local/ (compose init) · observability/ (otel, prometheus, grafana)
docs/                    architecture, ADRs, api (generated), runbooks
scripts/                 bootstrap · seed-demo-data · smoke-test · gen-openapi
```

## Standards

- **Python:** 3.12, fully type-hinted, `ruff` (lint+format), `mypy`. `make lint` must pass.
- **Tests:** `pytest`. Unit tests everywhere; mark cross-service ones `@pytest.mark.integration`
  (they use `testcontainers`). New endpoints need tests.
- **APIs:** every service auto-serves `/openapi.json` `/docs` `/redoc`. Run `make openapi` and
  commit `docs/api/finsight.openapi.json` — CI fails if it's stale. Follow existing naming
  (`/v1/<domain>/<verb-or-noun>`, RFC 9457 errors).
- **Events:** add contracts to `finsight_common.events.catalog`. Breaking change ⇒ new
  `.v<n>` topic, keep the old consumer through migration.
- **DB changes:** add an Alembic migration (`cd services/<svc> && uv run alembic revision --autogenerate -m "..."`).
- **Secrets:** never commit them. Local: `.env`. Prod: AWS Secrets Manager via ESO.
- **Architecture decisions:** add an ADR under `docs/adr/` (copy `0001`).

## Commit & PR flow

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `infra:`) — enforced by hook.
- Branch off `main`; open a PR with the template filled in.
- CI (`ci` + `security`) must be green. `main` merges deploy to staging automatically;
  tagging `v*` promotes to production behind a manual approval gate.
