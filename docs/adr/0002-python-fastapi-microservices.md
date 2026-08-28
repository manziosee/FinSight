# 2. Python + FastAPI microservices

Date: 2026-08-28

## Status
Accepted

## Context
FinSight is AI/ML-heavy (transaction understanding, entity resolution, anomaly detection,
LLM orchestration, forecasting) and API-first. We need fast iteration, first-class async I/O,
and automatic OpenAPI. The team is strongest in Python.

## Decision
Python 3.12 with FastAPI for every service. One repo (uv workspace) with a shared
`finsight-common` library. Services are split by bounded context (identity, ingestion,
normalization, graph, reconciliation, intelligence, anomaly, forecast, action) and communicate
via a Kafka event backbone plus synchronous calls through the gateway.

Alternatives considered: Go (best runtime, weak ML ecosystem — would force Python sidecars);
NestJS (good structure, still offloads ML); a modular monolith (simpler ops, but couples the
very different scaling/latency profiles of ingestion vs. graph vs. LLM work).

## Consequences
+ Shared schema/event/auth code in one library; uniform tooling (ruff, mypy, pytest).
+ Each service scales and deploys independently.
− More operational surface (10 deployables). Mitigated by one generic Helm chart + one Dockerfile.
− Python throughput ceiling on hot paths (gateway, ingestion) — revisit with a Go rewrite of a
  single service if profiling demands it; the event contracts make that swap local.
