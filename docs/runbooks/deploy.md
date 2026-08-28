# Runbook — Deploy

## Staging (automatic)
Merge to `main` → `cd-staging.yml`:
1. Build + push all 10 images to staging ECR (`tag = ${sha:0:12}`).
2. `helm upgrade --install finsight` with staging values → runs pre-upgrade Alembic Jobs → rolling update.
3. Port-forwards `api-gateway` and runs `scripts/smoke-test.sh`.

Manual: `gh workflow run cd-staging.yml`.

## Production (gated)
Tag `vX.Y.Z` (or `workflow_dispatch` with an `image_tag`) → `cd-production.yml`:
1. `promote-images` copies the exact staging image digests into production ECR.
2. `deploy` waits on the **production** GitHub Environment approval, then
   `helm upgrade --install --atomic` with production values (canary via Argo Rollouts if present).
3. Post-deploy smoke test.

## First-time environment bootstrap
```bash
cd deploy/terraform/envs/<env>
terraform init && terraform apply -var-file=<env>.tfvars
# then set repo/environment variables:
#   <ENV>_ECR_REGISTRY, <ENV>_DEPLOY_ROLE_ARN  (from terraform outputs)
# install cluster add-ons: external-secrets, cert-manager, traefik, kube-prometheus-stack,
#   neo4j, (argo-rollouts for prod)
```

## Rollback
```bash
helm -n finsight history finsight
helm -n finsight rollback finsight <REVISION> --wait
```
DB migrations are additive/backwards-compatible by policy; if a migration must be reverted,
run `alembic downgrade` via a one-off Job before rolling back app images.

## Verify
- `kubectl -n finsight get pods` all Ready; `helm status finsight`.
- `curl https://api.<env>.finsight.dev/health` and `/openapi.json` (path count ≥ 15).
- Grafana "FinSight — Service Overview": error rate flat, p95 nominal.
- Jaeger: a trace spanning gateway → ingestion → (kafka) → normalization → reconciliation.
