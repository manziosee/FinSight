"""Evidence gathering — pulls real numbers from reconciliation-service / graph-service
before anything reaches the LLM. The model explains and narrates; it never invents figures.
"""

from __future__ import annotations

from typing import Any

import httpx

from finsight_common.logging import get_logger

_log = get_logger(__name__)

_PII_KEYS = {"account_ref", "account_number", "iban", "email", "phone"}


def redact(payload: Any) -> Any:
    """Strip fields that must never reach a third-party LLM provider."""
    if isinstance(payload, dict):
        return {
            k: ("***redacted***" if k.lower() in _PII_KEYS else redact(v))
            for k, v in payload.items()
        }
    if isinstance(payload, list):
        return [redact(v) for v in payload]
    return payload


class EvidenceClient:
    def __init__(self, reconciliation_url: str, graph_url: str, timeout: float = 10.0) -> None:
        self._reconciliation_url = reconciliation_url
        self._graph_url = graph_url
        self._timeout = timeout

    def _headers(self, auth_header: str | None) -> dict[str, str]:
        return {"authorization": auth_header} if auth_header else {}

    async def reconciliation_summary(self, auth_header: str | None) -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.get(
                    f"{self._reconciliation_url}/v1/reconciliation/summary",
                    headers=self._headers(auth_header),
                )
                resp.raise_for_status()
                return redact(resp.json())
            except httpx.HTTPError as exc:
                _log.warning("evidence.summary_failed", error=str(exc))
                return {"has_data": False, "error": "reconciliation-service unavailable"}

    async def match_context(self, run_id: str, match_id: str, auth_header: str | None) -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.get(
                    f"{self._reconciliation_url}/v1/reconciliation/{run_id}",
                    headers=self._headers(auth_header),
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPError as exc:
                _log.warning("evidence.run_fetch_failed", error=str(exc))
                return {"found": False, "error": "reconciliation-service unavailable"}
        match = next((m for m in data.get("matches", []) if m["id"] == match_id), None)
        if match is None:
            unmatched = next(
                (u for u in data.get("unmatched_items", []) if u["record_id"] == match_id), None
            )
            if unmatched:
                return {"found": True, "kind": "unmatched", **redact(unmatched)}
            return {"found": False}
        return {"found": True, "kind": "match", **redact(match)}

    async def entity_context(self, entity_id: str, auth_header: str | None) -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.get(
                    f"{self._graph_url}/v1/graph/entities/{entity_id}",
                    headers=self._headers(auth_header),
                )
                resp.raise_for_status()
                return redact(resp.json())
            except httpx.HTTPError as exc:
                _log.warning("evidence.graph_fetch_failed", error=str(exc))
                return {}
