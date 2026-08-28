# FinSight — Infrastructure as Code (AWS)

Terraform that provisions the FinSight platform on AWS. Each environment under
`envs/` is an independent root module with its own remote state.

## Layout

```
modules/
  network       VPC, subnets, NAT, flow logs
  eks           EKS cluster + managed node group + IRSA
  ecr           one repository per service, scan-on-push, lifecycle policy
  rds           PostgreSQL (multi-AZ), encrypted, in private subnets
  msk           MSK (Kafka) cluster, TLS, in private subnets
  s3            raw-data bucket: versioned, SSE-KMS, public access blocked
  redis         ElastiCache Redis replication group
  github-oidc   IAM OIDC provider + deploy role for GitHub Actions (least privilege)
envs/
  staging/      composition for staging
  production/   composition for production
```

## Usage

```bash
cd envs/staging
terraform init          # uses S3 backend + DynamoDB lock (see backend.tf)
terraform plan  -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars
```

## Conventions

* Every resource is tagged `Project=finsight`, `Environment=<env>`, `ManagedBy=terraform`.
* No secrets in state where avoidable — DB master password is generated and pushed to
  AWS Secrets Manager under `finsight/<env>/<service>`.
* `checkov` runs in CI (`.github/workflows/security.yml`); keep it green.
* Graph store: Neo4j runs on EKS via its Helm chart for now. Swap to Amazon Neptune
  by adding a `modules/neptune` and repointing `FINSIGHT_NEO4J_URI` — see ADR 0004.
