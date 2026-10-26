"""Fetch and safely merge service OpenAPI documents into one public contract."""

from __future__ import annotations

from typing import Any

import httpx

from finsight_common.logging import get_logger

_log = get_logger(__name__)


def merge_openapi_specs(specs: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Merge specs and namespace schemas so one service cannot shadow another."""
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

    def rewrite_refs(value: Any, schema_names: dict[str, str]) -> Any:
        if isinstance(value, dict):
            rewritten = {}
            for key, item in value.items():
                if (
                    key == "$ref"
                    and isinstance(item, str)
                    and item.startswith("#/components/schemas/")
                ):
                    name = item.rsplit("/", 1)[-1]
                    item = f"#/components/schemas/{schema_names.get(name, name)}"
                rewritten[key] = rewrite_refs(item, schema_names)
            return rewritten
        if isinstance(value, list):
            return [rewrite_refs(item, schema_names) for item in value]
        return value

    for service, spec in specs.items():
        schemas = spec.get("components", {}).get("schemas", {})
        schema_names = {name: f"{service}_{name}" for name in schemas}
        for path, path_item in spec.get("paths", {}).items():
            if not path.startswith(("/v1/", "/.well-known/")):
                continue
            operations = rewrite_refs(path_item, schema_names)
            for method, operation in operations.items():
                if isinstance(operation, dict):
                    for tag_name in operation.get("tags", []):
                        if tag_name not in {tag.get("name") for tag in merged["tags"]}:
                            merged["tags"].append({"name": tag_name})
                is_public = (
                    path == "/v1/auth/token" and method.lower() == "post"
                ) or path == "/.well-known/jwks.json"
                if is_public and isinstance(operation, dict):
                    operation["security"] = []
            merged["paths"].setdefault(path, {}).update(operations)
        for name, schema in schemas.items():
            merged["components"]["schemas"][schema_names[name]] = rewrite_refs(schema, schema_names)
        tag_names = {tag.get("name") for tag in merged["tags"]}
        for tag in spec.get("tags", []):
            if tag.get("name") not in tag_names:
                merged["tags"].append(tag)
                tag_names.add(tag.get("name"))

    _log.info("openapi.aggregated", paths=len(merged["paths"]))
    return merged


async def build_aggregated_spec(client: httpx.AsyncClient, settings: Any) -> dict[str, Any]:
    specs: dict[str, dict[str, Any]] = {}
    for name, base_url in settings.openapi_sources.items():
        try:
            resp = await client.get(f"{base_url}/openapi.json", timeout=5.0)
            resp.raise_for_status()
            specs[name] = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            _log.warning("openapi.fetch_failed", service=name, error=str(exc))
    return merge_openapi_specs(specs)
