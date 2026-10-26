# FinSight — Infrastructure as Code (AWS)

Terraform that provisions the FinSight platform on AWS. Each environment under
`envs/` is an independent root module with its own remote state.

## Layout

```
modules/
  network            VPC, subnets, NAT (one per AZ in production), flow logs
  eks                EKS + managed node group + IRSA; private API endpoint by default;
                     EKS access entry for the CI deploy role
  ecr                one repository per service, scan-on-push, lifecycle policy
  rds                PostgreSQL (multi-AZ in prod), encrypted, force_ssl; one generated
                     login per service database
  msk                MSK (Kafka), SASL/SCRAM over TLS (9096), reachable from EKS nodes only
  redis              ElastiCache Redis, TLS + AUTH token, reachable from EKS nodes only
  s3                 raw-data bucket: versioned, SSE-KMS, public access blocked
  irsa               IAM roles for service accounts: ingestion/normalization S3 access,
                     External Secrets Operator, AWS Load Balancer Controller
  security-baseline  WAF for the API's ALB; GuardDuty (EKS audit + runtime, S3) and a
                     multi-region CloudTrail when enable_account_baseline = true
  service-secrets    Secrets Manager secret per consumer: finsight/<env>/<name>
  github-oidc        deploy role for GitHub Actions (ECR scoped to FinSight repositories)
envs/
  staging/           composition for staging
  production/        composition for production
```

## Usage

```bash
cd envs/staging
terraform init          # S3 backend + DynamoDB lock (see backend.tf)
terraform plan  -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars
terraform output -json helm_values   # copy into deploy/helm/finsight/values-staging.yaml
```

The EKS API is private unless you set `eks_public_access_cidrs` (never `0.0.0.0/0`). GitHub-
hosted runners can't reach a private endpoint: run CD from a self-hosted runner in the VPC,
or allow-list your runner/VPN egress IPs.

## Cluster prerequisites (once per cluster)

The chart expects these controllers, each using the IRSA role Terraform outputs:

| Controller | Namespace / service account | Role output |
|---|---|---|
| External Secrets Operator + a `ClusterSecretStore` named `aws-secrets-manager` | `external-secrets/external-secrets` | `external_secrets_role_arn` |
| AWS Load Balancer Controller | `kube-system/aws-load-balancer-controller` | `load_balancer_controller_role_arn` |
| Prometheus operator (for `ServiceMonitor`s) | `monitoring` | — |

## Secrets

Terraform writes one secret per consumer, named and keyed exactly as the Helm chart's
ExternalSecrets import them (`dataFrom.extract`): `finsight/<env>/<service>` holding
`{"FINSIGHT_…": "…"}`. Database credentials are per service (`<db>_svc`); the master DSN
is only in `finsight/<env>/db-bootstrap`, read by the chart's bootstrap hook.

`finsight/<env>/intelligence-service` is operator-managed; Terraform creates it once and never
overwrites it. Set the key with:

```bash
aws secretsmanager put-secret-value --secret-id finsight/production/intelligence-service \
  --secret-string '{"ANTHROPIC_API_KEY":"…"}'
```

Generated secrets (DB, MSK, Redis, Neo4j passwords, the JWT signing key) live in Terraform
state: keep the state bucket encrypted and access-restricted.

## Conventions

* Every resource is tagged `Project=finsight`, `Environment=<env>`, `ManagedBy=terraform`.
* `terraform fmt -check` and `validate` run in CI (`iac` job); `checkov` runs in
  `.github/workflows/security.yml`.
* GuardDuty and CloudTrail are account/region-wide, so `enable_account_baseline` is on in
  production only. If staging lives in a different AWS account, enable it there too.
