"""AI-assisted column mapper — the fallback when heuristics can't find amount/date/party.

Given the header row + a few sample rows, ask an LLM to produce a mapping from source
columns to the Universal Financial Schema fields. Disabled unless
``FINSIGHT_AI_MAPPER_ENABLED`` is set; otherwise :func:`suggest_mapping` returns ``{}`` and
the heuristic result stands (flagged low-confidence).
"""

from __future__ import annotations

import json
import os

import httpx

from finsight_common.logging import get_logger

_log = get_logger(__name__)

_SCHEMA_FIELDS = [
    "date",
    "amount",
    "debit",
    "credit",
    "currency",
    "description",
    "reference",
    "counterparty",
    "type",
]

_SYSTEM = (
    "You map messy financial spreadsheet/statement columns to a fixed schema. "
    "Reply ONLY with a compact JSON object {schema_field: source_column_name}. "
    "Omit fields you cannot map. Never invent column names."
)


async def suggest_mapping(headers: list[str], sample_rows: list[dict]) -> dict[str, str]:
    if not os.getenv("FINSIGHT_AI_MAPPER_ENABLED"):
        return {}
    intel_url = os.getenv("FINSIGHT_INTELLIGENCE_URL", "http://intelligence-service:8000")
    prompt = (
        f"Schema fields: {_SCHEMA_FIELDS}\n"
        f"Source headers: {headers}\n"
        f"Sample rows: {json.dumps(sample_rows[:3], default=str)}\n"
        "Return the mapping JSON."
    )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{intel_url}/internal/map-columns",
                json={"system": _SYSTEM, "prompt": prompt},
            )
        resp.raise_for_status()
        mapping = resp.json().get("mapping", {})
        return {k: v for k, v in mapping.items() if k in _SCHEMA_FIELDS and v in headers}
    except Exception as exc:
        _log.warning("ai_mapper.failed", error=str(exc))
        return {}


def remap_rows(rows: list[dict], mapping: dict[str, str]) -> list[dict]:
    if not mapping:
        return rows
    inv = {src: dst for dst, src in mapping.items()}
    return [{inv.get(k, k): v for k, v in row.items()} for row in rows]
