# 4. Neo4j for the financial graph

Date: 2026-08-28

## Status
Accepted

## Context
FinSight's differentiator is a **financial knowledge graph** linking
Customer→Order→Invoice→Payment→BankTransaction→Account. Core queries are multi-hop traversals
("everything connected to this customer", "shortest path payment↔bank line", "why unmatched").
Those are painful and slow in SQL.

## Decision
Store the graph in **Neo4j** (Cypher, native traversals). Locally: `neo4j:5.22-community`
container. In AWS: Neo4j on EKS via its official Helm chart for now.

Alternatives: PostgreSQL recursive CTEs (fine to ~2 hops, degrades fast); Amazon Neptune
(managed, but Gremlin/openCypher tooling friction and cost at our stage); ArangoDB / Memgraph
(smaller ecosystems).

## Consequences
+ Traversal queries are simple and fast; graph is a first-class product surface (`/v1/graph/*`).
− A second datastore to operate and back up.
− Managed option deferred. **Swap path:** add `deploy/terraform/modules/neptune`, repoint
  `FINSIGHT_NEO4J_URI`, and port the handful of Cypher queries in
  `services/graph-service/src/graph_service/graph.py` to openCypher. The rest of the system
  only sees `graph.updated` events and the graph-service HTTP API.
