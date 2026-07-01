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
