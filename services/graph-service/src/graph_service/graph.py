"""Neo4j-backed financial graph builder and query surface."""

from __future__ import annotations

from typing import Any

from neo4j import AsyncGraphDatabase

from finsight_common.schemas import FinancialRecord, RecordType

_CONSTRAINTS = [
    "CREATE CONSTRAINT node_id IF NOT EXISTS FOR (n:Entity) REQUIRE (n.tenant_id, n.id) IS UNIQUE",
]

_TYPE_TO_LABEL = {
    RecordType.payment.value: "Payment",
    RecordType.invoice.value: "Invoice",
    RecordType.bank_transaction.value: "BankTransaction",
    RecordType.refund.value: "Refund",
    RecordType.fee.value: "Fee",
}


class FinancialGraph:
    def __init__(self, uri: str, user: str, password: str) -> None:
        self._driver = AsyncGraphDatabase.driver(uri, auth=(user, password))

    async def close(self) -> None:
        await self._driver.close()

    async def ping(self) -> bool:
        try:
            await self._driver.verify_connectivity()
            return True
        except Exception:
            return False

    async def init_schema(self) -> None:
        async with self._driver.session() as session:
            for stmt in _CONSTRAINTS:
                await session.run(stmt)

    async def upsert_records(
        self, tenant_id: str, records: list[FinancialRecord]
    ) -> dict[str, int]:
        nodes = edges = 0
        async with self._driver.session() as session:
            for rec in records:
                label = _TYPE_TO_LABEL.get(str(rec.type), "Transaction")
                await session.run(
                    """
                    MERGE (n:Entity {tenant_id: $tenant_id, id: $id})
                    SET n += $props, n.kind = $label
                    """,
                    tenant_id=tenant_id,
                    id=rec.id,
                    label=label,
                    props={
                        "amount_minor": rec.amount.minor_units,
                        "currency": rec.amount.currency,
                        "reference": rec.reference,
                        "description": rec.description,
                        "occurred_at": rec.occurred_at.isoformat(),
                        "direction": rec.direction,
                    },
                )
                nodes += 1

                if rec.counterparty and rec.counterparty.normalized_name:
                    cust_id = f"cust_{rec.counterparty.normalized_name.replace(' ', '_')}"
                    await session.run(
                        """
                        MERGE (c:Entity {tenant_id: $tenant_id, id: $cid})
                        SET c.kind = 'Customer', c.name = $name
                        WITH c
                        MATCH (n:Entity {tenant_id: $tenant_id, id: $rid})
                        MERGE (c)-[:TRANSACTED { via: $kind }]->(n)
                        """,
                        tenant_id=tenant_id,
                        cid=cust_id,
                        name=rec.counterparty.name,
                        rid=rec.id,
                        kind=str(rec.type),
                    )
                    nodes += 1
                    edges += 1

                # Link a payment to an invoice sharing the same reference.
                if str(rec.type) == RecordType.payment.value and rec.reference:
                    res = await session.run(
                        """
                        MATCH (p:Entity {tenant_id: $tenant_id, id: $pid})
                        MATCH (i:Entity {tenant_id: $tenant_id, kind: 'Invoice', reference: $ref})
                        MERGE (p)-[r:PAYS]->(i)
                        RETURN count(r) AS c
                        """,
                        tenant_id=tenant_id,
                        pid=rec.id,
                        ref=rec.reference,
                    )
                    row = await res.single()
                    edges += int(row["c"]) if row else 0
        return {"nodes": nodes, "edges": edges}

    async def entity(self, tenant_id: str, entity_id: str, depth: int = 2) -> dict[str, Any]:
        async with self._driver.session() as session:
            res = await session.run(
                f"""
                MATCH (n:Entity {{tenant_id: $tenant_id, id: $id}})
                OPTIONAL MATCH path = (n)-[*1..{max(1, min(depth, 4))}]-(m:Entity)
                RETURN n AS root,
                       collect(DISTINCT m {{.id, .kind, .reference, .amount_minor}})
                         AS neighbours
                """,
                tenant_id=tenant_id,
                id=entity_id,
            )
            row = await res.single()
            if not row or row["root"] is None:
                return {}
            root = dict(row["root"])
            return {"entity": root, "connected": [n for n in row["neighbours"] if n.get("id")]}

    async def paths(self, tenant_id: str, from_id: str, to_id: str) -> list[list[str]]:
        async with self._driver.session() as session:
            res = await session.run(
                """
                MATCH (a:Entity {tenant_id: $tenant_id, id: $from_id}),
                      (b:Entity {tenant_id: $tenant_id, id: $to_id}),
                      p = shortestPath((a)-[*..6]-(b))
                RETURN [node IN nodes(p) | node.id] AS ids
                """,
                tenant_id=tenant_id,
                from_id=from_id,
                to_id=to_id,
            )
            return [row["ids"] async for row in res]
