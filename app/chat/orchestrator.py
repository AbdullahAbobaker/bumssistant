"""The chat loop — where every piece of the brain comes together (DECISIONS.md #17, #19).

    log user turn  →  retrieve memory  →  build BumFlow prompt  →  LLM  →  log reply
                   →  schedule async extraction (reply first, learn second)

The orchestrator depends only on small interfaces (ChatPort, LLMClient, TaskRunner), so
it runs end-to-end with mocks and no database — see the test.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.background import TaskRunner
from app.chat.session import Msg, build_window
from app.llm import ChatMessage, LLMClient
from app.memory.retrieval import Candidate, select_for_context
from app.persona import build_system_prompt


@dataclass
class TurnContext:
    display_name: str
    coaching_style: str | None
    rolling_summary: str
    recent: list[Msg]                        # prior turns (excludes the incoming message)
    always_on_summary: str = ""              # active projects + tasks due/overdue
    memory_candidates: list[Candidate] = field(default_factory=list)


class ChatPort(Protocol):
    async def load_context(self, user_id: str, user_text: str) -> TurnContext: ...
    async def log_message(self, user_id: str, role: str, content: str) -> None: ...
    async def extract_memories(self, user_id: str, user_text: str, reply: str) -> None: ...


def _compose_memory_block(ctx: TurnContext) -> str:
    selected = select_for_context(ctx.memory_candidates)
    lines = []
    if ctx.always_on_summary:
        lines.append(ctx.always_on_summary)
    if selected:
        lines.append("Relevant: " + "; ".join(c.title for c in selected))
    return "\n".join(lines)


async def handle_turn(
    user_id: str,
    user_text: str,
    *,
    port: ChatPort,
    llm: LLMClient,
    runner: TaskRunner,
) -> str:
    # 1. Immediate logging (Decision #17).
    await port.log_message(user_id, "user", user_text)

    # 2. Retrieve: always-on core + score-fused top memories.
    ctx = await port.load_context(user_id, user_text)

    # 3. Build BumFlow's prompt: persona + tone + confirmed memory.
    system = build_system_prompt(
        ctx.coaching_style,
        confirmed_memory_summary=_compose_memory_block(ctx),
        user_name=ctx.display_name,
    )
    if ctx.rolling_summary:
        system += f"\n\nBisheriges Gespräch (Zusammenfassung):\n{ctx.rolling_summary}"

    # 4. Assemble bounded window + the new turn, then call the LLM.
    window = build_window(ctx.recent, ctx.rolling_summary)
    messages = [ChatMessage(m.role, m.content) for m in window.recent]
    messages.append(ChatMessage("user", user_text))
    reply = await llm.chat(system, messages)

    # 5. Log the reply, then learn in the background (never block the user).
    await port.log_message(user_id, "assistant", reply)
    runner.run_later(port.extract_memories(user_id, user_text, reply))
    return reply
