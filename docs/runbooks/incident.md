# Runbook — Incident response

## Triage
1. Grafana → **FinSight — Service Overview**: which service, error rate, latency.
2. Jaeger: filter by the failing `trace_id` (returned in every `problem+json` via logs).
3. `kubectl -n finsight logs deploy/<service> --tail=200` (structured JSON; grep `error`).

## Common failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| 502 from gateway | upstream pod not Ready | `kubectl get pods`; check `/ready` for DB/Kafka failure |
| Normalization lag | Kafka consumer stalled / poison message | check consumer group lag in MSK; inspect `event.handler_failed` logs; a DLQ is TODO — for now fix data + reset offset |
| Reconciliation returns 0 matches | records not yet consumed, or threshold too high | check `records.stored` logs; `FINSIGHT_MIN_CONFIDENCE` |
| 401 storms | JWKS rotation / clock skew | verify `identity-service` `/.well-known/jwks.json`; check pod time |
| Outbox growing | relay crashed / Kafka unreachable | `SELECT count(*) FROM outbox WHERE published_at IS NULL`; restart the service |

## Escalation
- Data integrity risk (wrong matches applied, money-moving action executed): page the on-call
  lead, freeze `action-service` (`kubectl scale deploy/action-service --replicas=0`).
- Suspected breach: follow SECURITY.md; rotate `finsight/<env>/*` secrets, revoke API keys via
  `identity-service`.

## After
Write a short postmortem; if it was an architectural gap, add/adjust an ADR.
