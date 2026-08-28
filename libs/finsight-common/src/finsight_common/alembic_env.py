"""Shared Alembic env runner. Each service's migrations/env.py is a 3-line shim."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from finsight_common.db import Base


def run(dsn: str, target_metadata_modules: Sequence[str]) -> None:
    for mod in target_metadata_modules:
        __import__(mod)  # register models on Base.metadata

    cfg = context.config
    cfg.set_main_option("sqlalchemy.url", dsn)
    target_metadata = Base.metadata

    def do_run(connection) -> None:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()

    async def run_async() -> None:
        engine = async_engine_from_config(
            cfg.get_section(cfg.config_ini_section, {}),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )
        async with engine.connect() as connection:
            await connection.run_sync(do_run)
        await engine.dispose()

    if context.is_offline_mode():
        context.configure(url=dsn, target_metadata=target_metadata, literal_binds=True)
        with context.begin_transaction():
            context.run_migrations()
    else:
        asyncio.run(run_async())
