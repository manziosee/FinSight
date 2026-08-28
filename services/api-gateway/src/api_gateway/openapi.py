"""Fetch each service's OpenAPI document and merge them into one public spec."""

from __future__ import annotations

from typing import Any

import httpx

from finsight_common.logging import get_logger

_log = get_logger(__name__)

_PUBLIC_PATH_PREFIXES = ("/v1/", "/.well-known/")


async def build_aggregated_spec(client: httpx.AsyncClient, settings: Any) -> dict:
    merged: dict[str, Any] = {
        "openapi": "3.1.0",
        "info": {
            "title": "FinSight API",
            "version": "v1",
            "description": "Unified financial intelligence API. Aggregated from FinSight services.",
        },
        "servers": [{"url": "/"}],
        "paths": {},
        "components": {
            "schemas": {},
            "securitySchemes": {
                "bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
                "apiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key"},
            },
        },
        "security": [{"bearerAuth": []}, {"apiKeyAuth": []}],
        "tags": [],
    }

    for name, base_url in settings.openapi_sources.items():
        try:
            resp = await client.get(f"{base_url}/openapi.json", timeout=5.0)
            resp.raise_for_status()
            spec = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            _log.warning("openapi.fetch_failed", service=name, error=str(exc))
            continue

        for path, item in spec.get("paths", {}).items():
            if path.startswith(_PUBLIC_PATH_PREFIXES):
                merged["paths"].setdefault(path, {}).update(item)
        for schema_name, schema in spec.get("components", {}).get("schemas", {}).items():
            merged["components"]["schemas"].setdefault(schema_name, schema)
        merged["tags"].append({"name": name})

    _log.info("openapi.aggregated", paths=len(merged["paths"]))
    return merged
