from __future__ import annotations

import asyncio

from fastapi import Depends, Query
from pydantic import BaseModel

from finsight_common.app import create_app
from finsight_common.auth import Principal, require_scopes
from finsight_common.events import (
    EventEnvelope,
    GraphUpdated,
    TransactionNormalized,
    topic_for,
)
from finsight_common.logging import get_logger
from finsight_common.messaging import KafkaEventBus
from graph_service import __version__
from graph_service.config import get_settings
from graph_service.graph import FinancialGraph

settings = get_settings()
log = get_logger("graph-service")
graph = FinancialGraph(settings.neo4j_uri, settings.neo4j_user, settings.neo4j_password)
bus = KafkaEventBus(
    settings.kafka_bootstrap_servers, client_id="graph-service", group_id="graph-service"
)
_consumer_task: asyncio.Task | None = None


async def _on_normalized(body: dict) -> None:
    env = EventEnvelope[TransactionNormalized].model_validate(body)
    counts = await graph.upsert_records(env.tenant_id, env.data.records)
    log.info("graph.updated", ingestion_id=env.data.ingestion_id, **counts)
    await bus.publish(
        EventEnvelope[GraphUpdated](
            type="graph.updated",
            tenant_id=env.tenant_id,
            producer="graph-service",
            data=GraphUpdated(
                ingestion_id=env.data.ingestion_id,
                nodes_upserted=counts["nodes"],
                edges_upserted=counts["edges"],
            ),
        )
    )


async def _startup() -> None:
    await graph.init_schema()
    await bus.start()
    bus.subscribe(topic_for(TransactionNormalized), _on_normalized)
    global _consumer_task
    _consumer_task = asyncio.create_task(bus.run_consumers())


async def _shutdown() -> None:
    if _consumer_task:
        _consumer_task.cancel()
    await bus.stop()
    await graph.close()


app = create_app(
    settings=settings,
    version=__version__,
    title="FinSight Graph Service",
    description="Builds and queries the financial knowledge graph (Customer→Invoice→Payment→Bank).",
    ready_checks={"neo4j": graph.ping},
    on_startup=_startup,
    on_shutdown=_shutdown,
)


class EntityView(BaseModel):
    entity: dict
    connected: list[dict]


@app.get("/v1/graph/entities/{entity_id}", response_model=EntityView, tags=["graph"])
async def get_entity(
    entity_id: str,
    depth: int = Query(default=2, ge=1, le=4),
    principal: Principal = Depends(require_scopes("graph:read")),
) -> EntityView:
    result = await graph.entity(principal.tenant_id, entity_id, depth)
    if not result:
        from finsight_common.errors import NotFoundError

        raise NotFoundError(f"entity {entity_id} not found")
    return EntityView(**result)


@app.get("/v1/graph/paths", tags=["graph"])
async def get_paths(
    from_id: str,
    to_id: str,
    principal: Principal = Depends(require_scopes("graph:read")),
) -> dict:
    return {"paths": await graph.paths(principal.tenant_id, from_id, to_id)}
