"""Bring-your-own-AI provider abstraction.

The financial-intelligence prompts live here; the concrete model is swappable by config
(FINSIGHT_LLM_PROVIDER). Providers must never receive raw PII — callers pass
already-redacted, structured summaries.

Supported providers:
- ``anthropic``  — Claude via the Anthropic SDK (ANTHROPIC_API_KEY)
- ``groq``       — Groq's OpenAI-compatible API (GROQ_API_KEY)
- ``openrouter`` — OpenRouter's OpenAI-compatible API (OPENROUTER_API_KEY)
- ``ollama``     — a local/self-hosted Ollama server (OLLAMA_BASE_URL, no key)
- ``openai``     — any other OpenAI-compatible endpoint (FINSIGHT_LLM_BASE_URL + OPENAI_API_KEY)

Without the needed key/URL the service falls back to an offline echo provider, so the API
keeps working (with placeholder explanations) instead of failing.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

import httpx

from finsight_common.logging import get_logger

_log = get_logger(__name__)

DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5"


class LLMProvider(Protocol):
    async def complete(self, system: str, prompt: str) -> str: ...


class EchoProvider:
    """Deterministic offline provider used in tests and when no provider is configured."""

    async def complete(self, system: str, prompt: str) -> str:
        return f"[offline-explanation] {prompt[:280]}"


class AnthropicProvider:
    def __init__(self, model: str = DEFAULT_ANTHROPIC_MODEL) -> None:
        self._model = model

    async def complete(self, system: str, prompt: str) -> str:
        import anthropic
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic()
        try:
            msg = await client.messages.create(
                model=self._model,
                max_tokens=2048,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
        except anthropic.RateLimitError as exc:
            _log.warning("llm.rate_limited", error=str(exc))
            raise
        except anthropic.APIStatusError as exc:
            _log.error("llm.api_error", status=exc.status_code, error=str(exc))
            raise
        except anthropic.APIConnectionError as exc:
            _log.error("llm.connection_error", error=str(exc))
            raise
        if msg.stop_reason == "refusal":
            _log.warning("llm.refused", category=getattr(msg.stop_details, "category", None))
            return "The assistant declined to answer this request."
        return "".join(block.text for block in msg.content if block.type == "text")


class OpenAICompatibleProvider:
    """Chat Completions over plain HTTP — Groq, OpenRouter, Ollama and other compatible APIs."""

    def __init__(
        self,
        *,
        name: str,
        base_url: str,
        model: str,
        api_key: str | None = None,
        timeout: float = 60.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._name = name
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._model = model
        self._headers = {"content-type": "application/json"}
        if api_key:
            self._headers["authorization"] = f"Bearer {api_key}"
        if name == "openrouter":
            self._headers["x-title"] = "FinSight"
        self._timeout = timeout
        self._transport = transport

    async def complete(self, system: str, prompt: str) -> str:
        body = {
            "model": self._model,
            "max_tokens": 2048,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        }
        async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
            try:
                resp = await client.post(self._url, json=body, headers=self._headers)
            except httpx.HTTPError as exc:
                _log.error("llm.connection_error", provider=self._name, error=str(exc))
                raise
        if resp.status_code >= 400:
            # Never log the request (it carries the prompt); the status and a short body are enough.
            _log.error(
                "llm.api_error",
                provider=self._name,
                status=resp.status_code,
                error=resp.text[:300],
            )
            resp.raise_for_status()
        choices = resp.json().get("choices") or []
        if not choices:
            return ""
        return str((choices[0].get("message") or {}).get("content") or "").strip()


@dataclass(frozen=True)
class _Compat:
    base_url: str
    key_env: str | None
    default_model: str


_COMPAT: dict[str, _Compat] = {
    "groq": _Compat("https://api.groq.com/openai/v1", "GROQ_API_KEY", "openai/gpt-oss-120b"),
    "openrouter": _Compat(
        "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "meta-llama/llama-3.3-70b-instruct"
    ),
    "ollama": _Compat("http://localhost:11434/v1", None, "llama3.1"),
    "openai": _Compat("https://api.openai.com/v1", "OPENAI_API_KEY", "gpt-4o-mini"),
}


def get_provider(name: str, model: str | None = None, base_url: str | None = None) -> LLMProvider:
    name = (name or "").strip().lower()
    if name == "anthropic" and os.getenv("ANTHROPIC_API_KEY"):
        return AnthropicProvider(model or DEFAULT_ANTHROPIC_MODEL)
    spec = _COMPAT.get(name)
    if spec is not None:
        key = os.getenv(spec.key_env) if spec.key_env else None
        url = base_url or (os.getenv("OLLAMA_BASE_URL") if name == "ollama" else None)
        if spec.key_env is None or key:
            _log.info("llm.provider", provider=name, model=model or spec.default_model)
            return OpenAICompatibleProvider(
                name=name,
                base_url=url or spec.base_url,
                model=model or spec.default_model,
                api_key=key,
            )
    _log.info("llm.provider.fallback", requested=name)
    return EchoProvider()
