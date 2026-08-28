# api-gateway

Edge service. Authenticates callers (JWT / API key via `finsight_common.auth`), enforces
per-principal rate limits (Redis, fail-open), reverse-proxies `/v1/*` to the owning service,
and serves the **aggregated** OpenAPI spec at `/openapi.json` + `/docs` (built by pulling every
service's spec and namespacing paths).

- Routing table & upstream URLs: `src/api_gateway/config.py`
- Aggregation: `src/api_gateway/openapi.py` (also `POST /internal/openapi/refresh`)
- Public (no-auth) prefixes: `/v1/auth/token`, `/.well-known/jwks.json`, ops endpoints
- Port 8000. Local: behind Traefik at http://localhost:8088
