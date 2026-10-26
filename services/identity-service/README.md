# identity-service

Issues credentials and keeps the audit trail. Owns the `identity` PostgreSQL database.

- **OAuth2 client credentials** → RS256 JWTs carrying `tenant_id` and scopes;
  public keys at `/.well-known/jwks.json` (every service verifies against them).
- **API keys**: only a SHA-256 hash is stored; a key can never carry more scopes than the
  token that created it.
- **Audit trail**: consumes `audit.recorded` from every service.
- **Optional seed client** (`FINSIGHT_SEED_CLIENT_ID`/`SECRET`): created on startup, its
  secret rotated when the configured value changes. In staging/production the service
  refuses to start with a weak seed secret or without `FINSIGHT_JWT_PRIVATE_KEY_PEM`.

| Endpoint | Scope |
|---|---|
| `POST /v1/auth/token` | public (form: `grant_type=client_credentials`) |
| `POST /v1/api-keys` | `api-keys:write` |
| `GET /v1/audit` | `audit:read` |
| `GET /.well-known/jwks.json` | public |
| `POST /v1/api-keys/introspect` | internal only (not routed by the gateway) |

Port 8000 (`/health`, `/ready`, `/metrics`, `/docs`). Shared building blocks come from
[finsight-common](../../libs/finsight-common). See [ARCHITECTURE.md](../../ARCHITECTURE.md).
