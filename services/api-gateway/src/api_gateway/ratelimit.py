"""Redis-backed fixed-window rate limiter keyed by principal (falls open if Redis is down)."""

from __future__ import annotations

import time

from finsight_common.logging import get_logger

_log = get_logger(__name__)


class RateLimiter:
    def __init__(self, redis_url: str, limit_per_minute: int) -> None:
        self._redis_url = redis_url
        self._limit = limit_per_minute
        self._client = None

    async def _get_client(self):
        if self._client is None:
            import redis.asyncio as redis

            self._client = redis.from_url(self._redis_url, socket_timeout=0.25)
        return self._client

    async def check(self, key: str, *, limit: int | None = None) -> tuple[bool, int]:
        limit = self._limit if limit is None else limit
        window = int(time.time() // 60)
        redis_key = f"rl:{key}:{window}"
        try:
            client = await self._get_client()
            count = await client.incr(redis_key)
            if count == 1:
                await client.expire(redis_key, 70)
            return count <= limit, max(0, limit - count)
        except Exception as exc:
            _log.warning("ratelimit.unavailable", error=str(exc))
            return True, limit
