"""LLM gateway abstraction (DECISIONS.md #5, #18).

Nothing else in the codebase imports Langdock directly — everything goes through the
LLMClient interface, so swapping providers is a config change, not a rewrite.

- MockLLM     : laptop dev. No network, deterministic. Keeps real data off dev machines.
- LangdockLLM : production. HTTP to Langdock's OpenAI-compatible API (EU-hosted).
"""
from __future__ import annotations

import hashlib
import json
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


@dataclass
class MemoryCandidate:
    type: str            # "task" | "pattern"
    title: str
    note: str = ""
    confidence: float = 0.6


class LLMClient(Protocol):
    async def chat(
        self, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
    ) -> "ChatResult": ...
    async def embed(self, text: str) -> list[float]: ...
    async def extract(self, user_text: str, reply: str) -> list["MemoryCandidate"]: ...


_TASK_TRIGGERS = ("muss", "todo", "aufgabe", "task")


class MockLLM:
    """Deterministic, offline. Used on private laptops and in tests.

    Tool-calling is deterministic: a keyword trigger emits a list_projects call so the
    offline server can demo the loop, and a `script` seeds an exact response sequence for
    precise tests."""

    def __init__(
        self,
        embedding_dim: int = 1536,
        script: list["ChatResult"] | None = None,
        extract_script: list[list["MemoryCandidate"]] | None = None,
    ) -> None:
        self._dim = embedding_dim
        self._script = list(script) if script is not None else None
        self._extract_script = list(extract_script) if extract_script is not None else None

    async def chat(
        self, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
    ) -> ChatResult:
        if self._script is not None:
            return self._script.pop(0)
        last = (messages[-1].content if messages else "") or ""
        tool_names = {t["function"]["name"] for t in (tools or [])}
        has_tool_result = any(m.role == "tool" for m in messages)
        if "list_projects" in tool_names and "projekt" in last.lower() and not has_tool_result:
            return ChatResult(tool_calls=[ToolCall(id="call_1", name="list_projects", arguments={})])
        if has_tool_result:
            return ChatResult(text="[mock BumFlow] Deine aktiven Projekte habe ich abgerufen.")
        return ChatResult(text=f"[mock BumFlow] Verstanden. Nächster Schritt zu: {last[:80]}")

    async def embed(self, text: str) -> list[float]:
        seed = hashlib.sha256(text.encode("utf-8")).digest()
        return [((seed[i % len(seed)] / 255.0) * 2 - 1) for i in range(self._dim)]

    async def extract(self, user_text: str, reply: str) -> list[MemoryCandidate]:
        if self._extract_script is not None:
            return self._extract_script.pop(0)
        low = (user_text or "").lower()
        if any(t in low for t in _TASK_TRIGGERS):
            return [MemoryCandidate(type="task", title=user_text.strip()[:80])]
        return []


def _build_payload(
    model: str, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
) -> dict:
    """Serialize to the OpenAI-compatible chat/completions wire shape (incl. tool calls)."""
    wire: list[dict] = [{"role": "system", "content": system}]
    for m in messages:
        if m.tool_calls:
            wire.append({
                "role": m.role,
                "content": m.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.name, "arguments": json.dumps(tc.arguments, ensure_ascii=False)},
                    }
                    for tc in m.tool_calls
                ],
            })
        elif m.tool_call_id:
            wire.append({"role": m.role, "content": m.content, "tool_call_id": m.tool_call_id})
        else:
            wire.append({"role": m.role, "content": m.content})
    payload: dict = {"model": model, "messages": wire}
    if tools:
        payload["tools"] = tools
    return payload


def _parse_result(data: dict) -> ChatResult:
    """Turn an OpenAI-compatible response into a ChatResult (text or tool calls)."""
    msg = data["choices"][0]["message"]
    raw_calls = msg.get("tool_calls") or []
    if raw_calls:
        return ChatResult(tool_calls=[
            ToolCall(
                id=c["id"],
                name=c["function"]["name"],
                arguments=json.loads(c["function"]["arguments"] or "{}"),
            )
            for c in raw_calls
        ])
    return ChatResult(text=msg.get("content"))


_EXTRACT_SYSTEM = (
    "Extrahiere aus dem folgenden Gespräch NUR konkrete Aufgaben (type 'task') und "
    "Arbeitsmuster (type 'pattern') der Person. Antworte AUSSCHLIESSLICH mit einem JSON-Array "
    "von Objekten {\"type\": \"task\"|\"pattern\", \"title\": string, \"note\": string}. "
    "Extrahiere NIEMALS Gesundheits-, Krankheits- oder mentale/psychische Informationen "
    "(no health, illness, or mental-state information). Nichts gefunden -> leeres Array []."
)


def _build_extract_payload(user_text: str, reply: str) -> dict:
    """OpenAI-compatible payload asking for a JSON array of task/pattern candidates."""
    return {
        "model": "claude-sonnet-5",
        "messages": [
            {"role": "system", "content": _EXTRACT_SYSTEM},
            {"role": "user", "content": f"Nutzer: {user_text}\nAssistent: {reply}"},
        ],
    }


def _parse_candidates(data: dict) -> list[MemoryCandidate]:
    """Parse the model's JSON array into MemoryCandidates. Malformed/absent *content* -> [];
    a malformed API envelope (missing choices/message) may raise — the caller's best-effort
    try/except in DbChatPort.extract_memories contains it."""
    content = data["choices"][0]["message"].get("content")
    if not content:
        return []
    try:
        items = json.loads(content)
    except (ValueError, TypeError):
        return []
    if not isinstance(items, list):
        return []
    out: list[MemoryCandidate] = []
    for it in items:
        if isinstance(it, dict) and it.get("type") and it.get("title"):
            out.append(MemoryCandidate(
                type=str(it["type"]),
                title=str(it["title"]),
                note=str(it.get("note") or ""),
                confidence=float(it.get("confidence", 0.6)),
            ))
    return out


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
        payload = _build_payload(self._chat_model, system, messages, tools)
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{self._base}/v1/chat/completions", json=payload, headers=self._headers
            )
            r.raise_for_status()
            return _parse_result(r.json())

    async def embed(self, text: str) -> list[float]:
        payload = {"model": self._embed_model, "input": text}
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{self._base}/v1/embeddings", json=payload, headers=self._headers)
            r.raise_for_status()
            return r.json()["data"][0]["embedding"]

    async def extract(self, user_text: str, reply: str) -> list[MemoryCandidate]:
        payload = _build_extract_payload(user_text, reply)
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{self._base}/v1/chat/completions", json=payload, headers=self._headers
            )
            r.raise_for_status()
            return _parse_candidates(r.json())


def get_llm(settings: Settings | None = None) -> LLMClient:
    """Pick the client. Real Langdock only in production WITH a key; otherwise mock."""
    settings = settings or get_settings()
    if settings.is_production and settings.langdock_api_key:
        return LangdockLLM(settings)
    return MockLLM(embedding_dim=settings.embedding_dim)
