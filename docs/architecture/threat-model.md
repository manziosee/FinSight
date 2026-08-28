# Threat model (STRIDE, lightweight)

Scope: the FinSight platform as deployed (edge → gateway → services → data stores → Kafka).

| Threat | Vector | Mitigation | Residual / TODO |
|---|---|---|---|
| **Spoofing** | Forged token / stolen API key | RS256 JWT w/ JWKS, short TTL; API keys hashed at rest, introspected; scopes per endpoint | Key rotation is manual; add automatic expiry |
| **Tampering** | Modified events, dual-write drift | Transactional outbox; Kafka `acks=all`, idempotent producer; consumers idempotent | Event payload signing not implemented |
| **Repudiation** | "I didn't approve that action" | `audit.recorded` on every mutation; action-service records requester + params | Audit store immutability (WORM) TODO |
| **Information disclosure** | Log leakage, cross-tenant reads, LLM prompt leakage | PII redaction processor; `tenant_id` enforced in every query; only redacted structured summaries sent to LLM providers | Field-level encryption not yet applied to all sensitive columns |
| **Denial of service** | Upload floods, expensive graph queries | Upload size/MIME limits; Redis per-principal rate limit + Traefik edge limit; graph traversal depth capped (≤4) | Per-tenant quotas / cost accounting TODO |
| **Elevation of privilege** | Container escape, over-broad IAM | Non-root, read-only rootfs, dropped caps, seccomp; least-privilege IRSA / GitHub OIDC roles; default-deny NetworkPolicies | Service mesh mTLS not enabled |

## Trust boundaries
1. Internet → Traefik (TLS termination, edge rate limit).
2. Traefik → api-gateway (authN/authZ, the only service reachable from ingress).
3. api-gateway → internal services (still re-verify the token; never trust the gateway alone).
4. Services → data stores / Kafka (private subnets, SG-restricted, encrypted in transit).
5. intelligence-service → external LLM provider (redacted, structured payloads only).

## Assets ranked
Raw financial data (S3) · reconciliation results & the financial graph · API credentials ·
audit trail · the matching-engine weights (the learning surface / IP).
