"""Bring-your-own-AI provider abstraction.

The financial-intelligence prompts live here; the concrete model is swappable per
tenant/config (Anthropic is the default). Providers must never receive raw PII —
callers pass already-redacted, structured summaries.
"""

from __future__ import annotations

import os
from typing import Protocol

from finsight_common.logging import get_logger

_log = get_logger(__name__)


class LLMProvider(Protocol):
    async def complete(self, system: str, prompt: str) -> str: ...


class EchoProvider:
    """Deterministic offline provider used in tests and when no API key is set."""

    async def complete(self, system: str, prompt: str) -> str:
        return f"[offline-explanation] {prompt[:280]}"


class AnthropicProvider:
    def __init__(self, model: str = "claude-opus-5") -> None:
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


def get_provider(name: str, model: str) -> LLMProvider:
    if name == "anthropic" and os.getenv("ANTHROPIC_API_KEY"):
        return AnthropicProvider(model)
    _log.info("llm.provider.fallback", requested=name)
    return EchoProvider()
