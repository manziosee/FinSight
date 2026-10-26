"""DSN normalisation for the asyncpg driver."""

from __future__ import annotations

import pytest

from finsight_common.db import async_dsn


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        # already SQLAlchemy/asyncpg form: unchanged
        (
            "postgresql+asyncpg://u:p@db:5432/identity",
            "postgresql+asyncpg://u:p@db:5432/identity",
        ),
        # fly postgres attach / libpq style
        (
            "postgres://u:p@finsight-pg.flycast:5432/identity?sslmode=disable",
            "postgresql+asyncpg://u:p@finsight-pg.flycast:5432/identity?ssl=disable",
        ),
        (
            "postgresql://u:p@db/x?sslmode=require",
            "postgresql+asyncpg://u:p@db/x?ssl=require",
        ),
        # URL-encoded password survives the round trip
        (
            "postgres://u:p%40ss@db/x",
            "postgresql+asyncpg://u:p%40ss@db/x",
        ),
    ],
)
def test_async_dsn(given: str, expected: str) -> None:
    assert async_dsn(given) == expected
