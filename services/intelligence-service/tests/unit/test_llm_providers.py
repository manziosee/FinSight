from __future__ import annotations

import json

import httpx
import pytest
from intelligence_service.llm import (
    AnthropicProvider,
    EchoProvider,
    OpenAICompatibleProvider,
    get_provider,
)

_KEYS = (
    "ANTHROPIC_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    "OLLAMA_BASE_URL",
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in _KEYS:
        monkeypatch.delenv(k, raising=False)


@pytest.mark.parametrize("name", ["anthropic", "groq", "openrouter", "openai", "unknown", ""])
def test_falls_back_to_echo_without_a_key(name: str) -> None:
    assert isinstance(get_provider(name), EchoProvider)


def test_anthropic_with_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    assert isinstance(get_provider("anthropic"), AnthropicProvider)


@pytest.mark.parametrize(
    ("name", "env", "url", "model"),
    [
        ("groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
        ("openrouter", "OPENROUTER_API_KEY", "https://openrouter.ai/api/v1", None),
    ],
)
def test_compatible_providers_use_their_endpoint(
    monkeypatch: pytest.MonkeyPatch, name: str, env: str, url: str, model: str | None
) -> None:
    monkeypatch.setenv(env, "secret")
    p = get_provider(name.upper())
    assert isinstance(p, OpenAICompatibleProvider)
    assert p._url == url + "/chat/completions"
    assert p._headers["authorization"] == "Bearer secret"
    if model:
        assert p._model == model


def test_ollama_needs_no_key_and_honours_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434/v1/")
    p = get_provider("ollama", model="qwen2.5")
    assert isinstance(p, OpenAICompatibleProvider)
    assert p._url == "http://host.docker.internal:11434/v1/chat/completions"
    assert "authorization" not in p._headers
    assert p._model == "qwen2.5"


async def test_complete_sends_chat_request_and_reads_answer() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": " Paid. "}}]})

    p = OpenAICompatibleProvider(
        name="groq",
        base_url="https://api.groq.com/openai/v1",
        model="m",
        api_key="k",
        transport=httpx.MockTransport(handler),
    )
    assert await p.complete("sys", "q") == "Paid."
    assert seen["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert seen["auth"] == "Bearer k"
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["model"] == "m"
    assert body["messages"] == [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "q"},
    ]


async def test_complete_raises_on_api_error() -> None:
    p = OpenAICompatibleProvider(
        name="groq",
        base_url="https://x/v1",
        model="m",
        api_key="bad",
        transport=httpx.MockTransport(lambda r: httpx.Response(401, json={"error": "invalid key"})),
    )
    with pytest.raises(httpx.HTTPStatusError):
        await p.complete("s", "p")
