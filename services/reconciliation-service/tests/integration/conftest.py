"""Integration fixtures: a real, throwaway PostgreSQL via testcontainers."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from testcontainers.community.postgres import PostgresContainer

from finsight_common.db import Database


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture
async def db(postgres_container) -> AsyncIterator[Database]:
    url = postgres_container.get_connection_url().replace("psycopg2", "asyncpg")
    database = Database(url)
    await database.create_all()
    try:
        yield database
    finally:
        async with database.engine.begin() as conn:
            from finsight_common.db import Base

            await conn.run_sync(Base.metadata.drop_all)
        await database.dispose()
