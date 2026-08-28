# identity-service

Tenants, OAuth2 client-credentials clients, API keys, RS256 JWT issuance and JWKS. Owns a PostgreSQL DB. Seeds a demo client on startup for local dev. Endpoints: POST /v1/auth/token, POST /v1/api-keys, POST /v1/api-keys/introspect (internal), GET /.well-known/jwks.json.

Port 8000. Shared building blocks come from `finsight-common`. See [ARCHITECTURE.md](../../ARCHITECTURE.md).
