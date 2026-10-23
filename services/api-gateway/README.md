# api-gateway

Edge service. Authenticates callers (JWT / API key via `finsight_common.auth`), enforces
per-principal rate limits (Redis, fail-open), reverse-proxies `/v1/*` to the owning service,
and serves the **aggregated** OpenAPI spec at `/openapi.json` + `/docs` (built by pulling every
service's spec and namespacing paths).

- Routing table & upstream URLs: `src/api_gateway/config.py`
- Aggregation: `src/api_gateway/openapi.py` (rebuilt lazily on a 30s TTL; at most every 5s while upstreams boot)
- Public (no-auth) paths, exact match: `/v1/auth/token`, `/.well-known/jwks.json` (plus the gateway's own ops/docs routes)
- Rate limits: per principal; anonymous callers per client IP taken from `X-Forwarded-For` (`FINSIGHT_TRUSTED_PROXY_HOPS`, default 1); `/v1/auth/token` additionally capped at `FINSIGHT_TOKEN_RATE_LIMIT_PER_MINUTE` (default 20) per IP
- Port 8000. Local: behind Traefik at http://localhost:8088
