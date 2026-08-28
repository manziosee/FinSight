# 3. Kafka event backbone with a transactional outbox

Date: 2026-08-28

## Status
Accepted

## Context
The pipeline (ingest → normalize → graph + reconcile → detect → act) is naturally
event-driven and the stages have very different throughput. We need durable, replayable,
ordered-per-tenant delivery, and reliable publishing from services that also write to a DB.

## Decision
Kafka as the backbone. **Redpanda** locally (single container, Kafka API), **Amazon MSK** in
AWS — no application code changes. Events are JSON `EventEnvelope`s; topics
`finsight.<domain>.<event>.v<major>`; message key = `tenant_id` for per-tenant ordering.

Producers use a **transactional outbox** (`finsight_common.messaging.outbox_sql`): the domain
row and an `outbox` row commit in one DB transaction; a background relay publishes and marks
sent. Consumers are idempotent.

Alternatives: RabbitMQ (weaker replay/retention), direct sync calls (no buffering, cascading
failure), AWS EventBridge (vendor lock, weaker ordering/replay).

## Consequences
+ Backpressure, replay, and new consumers without touching producers.
+ No dual-write inconsistency.
− Schema Registry / Avro not yet adopted — versioned pydantic models + `.vN` topics for now
  (upgrade path noted).
− Operational cost of Kafka; MSK sizing is in `deploy/terraform/modules/msk`.
