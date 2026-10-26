"""Async SQLAlchemy engine/session helpers shared by services that own a database."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def async_dsn(dsn: str) -> str:
    """Normalise a Postgres URL for SQLAlchemy's asyncpg driver.

    Accepts plain libpq-style URLs too (``postgres://…?sslmode=…``, as written by
    ``fly postgres attach`` and most managed providers): the driver is set to asyncpg and
    ``sslmode`` — which asyncpg rejects — becomes its ``ssl`` argument, which takes the same
    six libpq modes. The value must be kept: dropping ``sslmode=disable`` would leave
    asyncpg on its ``prefer`` default and attempt TLS against a server that has none.
    """
    url = make_url(dsn)
    if url.drivername in ("postgres", "postgresql"):
        url = url.set(drivername="postgresql+asyncpg")
    if url.drivername == "postgresql+asyncpg" and "sslmode" in url.query:
        sslmode = url.query["sslmode"]
        url = url.difference_update_query(["sslmode"]).update_query_dict({"ssl": sslmode})
    return url.render_as_string(hide_password=False)


class Database:
    def __init__(self, dsn: str, *, echo: bool = False) -> None:
        self._engine = create_async_engine(async_dsn(dsn), echo=echo, pool_pre_ping=True)
        self._sessionmaker = async_sessionmaker(self._engine, expire_on_commit=False)

    @property
    def engine(self):
        return self._engine

    @property
    def sessionmaker(self) -> async_sessionmaker[AsyncSession]:
        return self._sessionmaker

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self._sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def ping(self) -> bool:
        try:
            async with self._engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    async def create_all(self) -> None:
        """Dev/test convenience — production uses alembic migrations."""
        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def dispose(self) -> None:
        await self._engine.dispose()
