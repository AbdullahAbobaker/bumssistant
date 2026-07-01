"""Pure, DB-free tests for LLM tool-calling types and behavior (app/llm.py)."""
import asyncio
from app.llm import ChatMessage, ChatResult, MockLLM, ToolCall


def test_tool_types_construct():
    tc = ToolCall(id="c1", name="list_projects", arguments={})
    assert tc.name == "list_projects" and tc.arguments == {}
    r_text = ChatResult(text="hi")
    assert r_text.text == "hi" and r_text.tool_calls == []
    r_call = ChatResult(tool_calls=[tc])
    assert r_call.text is None and r_call.tool_calls[0] is tc


def test_chat_message_carries_tool_fields():
    m = ChatMessage("tool", content="{}", tool_call_id="c1")
    assert m.role == "tool" and m.tool_call_id == "c1"
    a = ChatMessage("assistant", tool_calls=[ToolCall("c1", "x", {})])
    assert a.content is None and a.tool_calls[0].id == "c1"
    # positional (role, content) construction still works
    assert ChatMessage("user", "hallo").content == "hallo"


def test_mockllm_chat_returns_chatresult_text():
    out = asyncio.run(MockLLM(8).chat("sys", [ChatMessage("user", "Was steht an?")]))
    assert isinstance(out, ChatResult)
    assert out.tool_calls == []
    assert "Was steht an?" in (out.text or "")


_LIST_PROJECTS_TOOL = {"type": "function", "function": {"name": "list_projects", "description": "", "parameters": {}}}


def test_mockllm_triggers_list_projects_then_answers():
    m = MockLLM(8)
    # round 1: user mentions "Projekte" + tool offered -> emits the tool call
    r1 = asyncio.run(m.chat("sys", [ChatMessage("user", "Zeig meine Projekte")], tools=[_LIST_PROJECTS_TOOL]))
    assert r1.text is None and len(r1.tool_calls) == 1
    assert r1.tool_calls[0].name == "list_projects"
    # round 2: a tool result is now present -> returns text, no more calls
    msgs = [
        ChatMessage("user", "Zeig meine Projekte"),
        ChatMessage("assistant", tool_calls=r1.tool_calls),
        ChatMessage("tool", content="[]", tool_call_id=r1.tool_calls[0].id),
    ]
    r2 = asyncio.run(m.chat("sys", msgs, tools=[_LIST_PROJECTS_TOOL]))
    assert r2.tool_calls == [] and r2.text


def test_mockllm_no_trigger_without_tool_or_keyword():
    m = MockLLM(8)
    # keyword but no tool offered -> plain text
    assert asyncio.run(m.chat("sys", [ChatMessage("user", "meine Projekte")])).tool_calls == []
    # tool offered but no keyword -> plain text
    r = asyncio.run(m.chat("sys", [ChatMessage("user", "Hallo")], tools=[_LIST_PROJECTS_TOOL]))
    assert r.tool_calls == [] and r.text


def test_mockllm_script_drives_sequence():
    scripted = ChatResult(tool_calls=[ToolCall("c9", "list_projects", {})])
    m = MockLLM(8, script=[scripted, ChatResult(text="fertig")])
    assert asyncio.run(m.chat("s", [])).tool_calls[0].id == "c9"
    assert asyncio.run(m.chat("s", [])).text == "fertig"
