"""Pure, DB-free tests for the orchestrator tool loop (app/chat/orchestrator.py)."""
import asyncio

from app.background import InProcessRunner
from app.chat.orchestrator import TurnContext, handle_turn
from app.chat.session import Msg
from app.llm import ChatMessage, ChatResult, MockLLM, ToolCall


class _Port:
    def __init__(self):
        self.log = []

    async def load_context(self, user_id, user_text):
        return TurnContext(display_name="Anna", coaching_style=None, rolling_summary="", recent=[])

    async def log_message(self, user_id, role, content):
        self.log.append((role, content))

    async def extract_memories(self, user_id, user_text, reply):
        pass


def test_tool_loop_dispatches_then_returns_final_text():
    async def run():
        calls = []

        async def dispatch(tc: ToolCall):
            calls.append(tc)
            return [{"id": "p1", "name": "Nordstern", "status": "active"}]

        llm = MockLLM(8, script=[
            ChatResult(tool_calls=[ToolCall("c1", "list_projects", {})]),
            ChatResult(text="Du hast 1 aktives Projekt: Nordstern."),
        ])
        reply = await handle_turn(
            "u1", "Zeig Projekte", port=_Port(), llm=llm, runner=InProcessRunner(),
            tools=[{"type": "function", "function": {"name": "list_projects"}}], dispatch=dispatch,
        )
        assert reply == "Du hast 1 aktives Projekt: Nordstern."
        assert len(calls) == 1 and calls[0].name == "list_projects"

    asyncio.run(run())


def test_dispatch_error_is_fed_back_not_raised():
    async def run():
        async def dispatch(tc: ToolCall):
            raise KeyError("unknown action: 'nope'")

        seen = {}

        class _SpyLLM(MockLLM):
            async def chat(self, system, messages, tools=None):
                seen["msgs"] = messages
                return await super().chat(system, messages, tools)

        llm = _SpyLLM(8, script=[
            ChatResult(tool_calls=[ToolCall("c1", "nope", {})]),
            ChatResult(text="Entschuldige, das ging nicht."),
        ])
        reply = await handle_turn(
            "u1", "x", port=_Port(), llm=llm, runner=InProcessRunner(),
            tools=[{"type": "function", "function": {"name": "list_projects"}}], dispatch=dispatch,
        )
        assert reply == "Entschuldige, das ging nicht."
        tool_msgs = [m for m in seen["msgs"] if m.role == "tool"]
        assert tool_msgs and "error" in tool_msgs[-1].content

    asyncio.run(run())


def test_no_tools_behaves_like_plain_chat():
    async def run():
        reply = await handle_turn(
            "u1", "Hallo", port=_Port(), llm=MockLLM(8), runner=InProcessRunner(),
        )
        assert reply and "Hallo" in reply

    asyncio.run(run())
