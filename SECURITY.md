# Security

## Reporting a vulnerability

Report it privately through GitHub: **Security → Report a vulnerability** on
https://github.com/manziosee/FinSight/security/advisories/new, with details and a PoC if
possible. Do not open a public issue. We aim to acknowledge within 3 business days and to ship a fix or
mitigation within 30 days for high-severity issues. We'll credit reporters who want it.

## Posture

FinSight processes highly sensitive financial data. Controls in this repository:

### Identity & access
- OAuth2 client-credentials + opaque API keys; RS256 JWTs verified against a rotating JWKS.
- Per-endpoint scopes (`require_scopes`), enforced in every service, not just the gateway.
- Hard multi-tenant isolation: `tenant_id` claim required, filtered into every query.
- Every mutating call emits an `audit.recorded` event.

### Data protection
- Field-level encryption helper (`finsight_common.security.FieldCipher`, Fernet) for
  account numbers / IBANs; blind-index for equality lookups.
- **Card PANs are never stored.** Logs run through a PII-redaction processor (PAN/email/secret).
- S3 raw bucket: versioned, SSE-KMS, public access blocked, lifecycle expiry.
- TLS everywhere: Traefik at the edge (cert-manager), MSK/RDS/Redis in-transit encryption.

### Supply chain & build
- Immutable ECR tags; images built non-root, slim base, read-only rootfs, all caps dropped.
- SBOM (Syft) + provenance on release images; Trivy image + filesystem scans in CI.
- `pip-audit`, Dependabot, Renovate for dependencies; Hadolint for Dockerfiles.

### Static analysis (CI: `.github/workflows/security.yml`)
- Bandit, Semgrep (`p/default`, `p/python`, `p/secrets`), CodeQL.
- gitleaks (pre-commit + CI) with `.gitleaks.toml` allowlisting only local-dev fixtures.
- Checkov for Terraform / compose / k8s; kubeconform for manifests; Spectral for the API spec.

### Runtime (Kubernetes)
- Default-deny NetworkPolicies + explicit allows; Pod Security "restricted".
- Secrets via AWS Secrets Manager + External Secrets Operator (never in Git or plain ConfigMaps).
- Redis-backed per-principal rate limiting at the gateway; Traefik edge rate limit + security headers.

### Known gaps (tracked)
- ClamAV upload scanning is a stub hook.
- GDPR data-subject endpoints are stubs.
- mTLS between services (service mesh) not yet enabled.
