# 6. Deploy on AWS EKS

Date: 2026-08-28

## Status
Accepted

## Context
We need managed Kubernetes, managed PostgreSQL/Kafka/Redis, object storage, a container
registry, and keyless CI deploys. The team picked AWS.

## Decision
- **Compute:** EKS + managed node group.
- **Data:** RDS PostgreSQL (Multi-AZ), MSK (Kafka), ElastiCache Redis, S3 (versioned, SSE-KMS).
- **Registry:** ECR, immutable tags, scan-on-push.
- **Delivery:** Helm umbrella chart; migrations as pre-upgrade Jobs; Argo Rollouts canary in prod.
- **Secrets:** AWS Secrets Manager + External Secrets Operator.
- **CI → AWS:** GitHub OIDC role per environment (`deploy/terraform/modules/github-oidc`), no
  long-lived keys. Production deploy gated by a GitHub Environment approval.
- **State:** Terraform, S3 backend + DynamoDB lock, one root module per environment.

Local dev deliberately mirrors this with Compose (Redpanda↔MSK, SeaweedFS↔S3, containers↔RDS/Redis)
so the same env-var contract works everywhere.

## Consequences
+ Everything managed except Neo4j (ADR 0004) and the app itself.
+ Reproducible infra; least-privilege keyless deploys.
− AWS coupling in `deploy/terraform`; the app layer stays portable (plain k8s + env vars).
