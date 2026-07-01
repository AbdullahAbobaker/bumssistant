"""LLM gateway abstraction (DECISIONS.md #5, #18).

Nothing else in the codebase imports Langdock directly — everything goes through the
LLMClient interface, so swapping providers is a config change, not a rewrite.

- MockLLM     : laptop dev. No network, deterministic. Keeps real data off dev machines.
- LangdockLLM : production. HTTP to Langdock's OpenAI-compatible API (EU-hosted).
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.config import Settings, get_settings


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class ChatResult:
    text: str | None = None
    tool_calls: list["ToolCall"] = field(default_factory=list)  # empty ⇒ final answer


@dataclass
class ChatMessage:
    role: str                                   # 'system' | 'user' | 'assistant' | 'tool'
    content: str | None = None
    tool_calls: list["ToolCall"] | None = None  # assistant proposing calls
    tool_call_id: str | None = None             # links a role='tool' result to a call


class LLMClient(Protocol):
    async def chat(
        self, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
    ) -> "ChatResult": ...
    async def embed(self, text: str) -> list[float]: ...


class MockLLM:
    """Deterministic, offline. Used on private laptops and in tests."""

    def __init__(self, embedding_dim: int = 1536) -> None:
        self._dim = embedding_dim

    async def chat(
        self, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
    ) -> ChatResult:
        last = messages[-1].content if messages else ""
        return ChatResult(text=f"[mock BumFlow] Verstanden. Nächster Schritt zu: {(last or '')[:80]}")

    async def embed(self, text: str) -> list[float]:
        # Deterministic pseudo-embedding from the text hash — stable across runs.
        seed = hashlib.sha256(text.encode("utf-8")).digest()
        return [((seed[i % len(seed)] / 255.0) * 2 - 1) for i in range(self._dim)]


class LangdockLLM:
    """Production client. Assumes an OpenAI-compatible API surface."""

    def __init__(self, settings: Settings) -> None:
        self._base = settings.langdock_base_url.rstrip("/")
        self._key = settings.langdock_api_key
        self._embed_model = settings.embedding_model
        self._chat_model = "claude-sonnet-5"  # via Langdock; swap in config later

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._key}"}

    async def chat(
        self, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
    ) -> ChatResult:
        payload = {
            "model": self._chat_model,
            "messages": [{"role": "system", "content": system}]
            + [{"role": m.role, "content": m.content} for m in messages],
        }
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{self._base}/v1/chat/completions", json=payload, headers=self._headers
            )
            r.raise_for_status()
            return ChatResult(text=r.json()["choices"][0]["message"]["content"])

    async def embed(self, text: str) -> list[float]:
        payload = {"model": self._embed_model, "input": text}
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{self._base}/v1/embeddings", json=payload, headers=self._headers)
            r.raise_for_status()
            return r.json()["data"][0]["embedding"]


def get_llm(settings: Settings | None = None) -> LLMClient:
    """Pick the client. Real Langdock only in production WITH a key; otherwise mock."""
    settings = settings or get_settings()
    if settings.is_production and settings.langdock_api_key:
        return LangdockLLM(settings)
    return MockLLM(embedding_dim=settings.embedding_dim)
