"""Pure, DB-free tests for the MCP adapter's read-only mapping (app/actions/mcp_server.py)."""
import pytest

from app.actions import registry  # noqa: F401  triggers built-in registration
from app.actions.mcp_server import mcp_tool_defs, resolve_read_tool


def test_mcp_tool_defs_exposes_read_only_only():
    defs = {d["name"]: d for d in mcp_tool_defs()}
    assert "list_projects" in defs           # read-only -> exposed
    assert "create_task" not in defs         # agent_writable, not read-only -> excluded
    assert "confirm_memory" not in defs      # neither -> excluded
    lp = defs["list_projects"]
    assert lp["description"]                          # non-empty description
    assert lp["inputSchema"]["type"] == "object"     # MCP inputSchema shape
    assert "function" not in lp                       # NOT the OpenAI tool_schema() wrapper


def test_resolve_read_tool_permits_read_refuses_others():
    assert resolve_read_tool("list_projects").name == "list_projects"
    with pytest.raises(PermissionError) as exc:      # write action refused before any ctx/DB
        resolve_read_tool("create_task")
    assert "create_task" not in str(exc.value)        # no internal name leaked
    with pytest.raises(KeyError):
        resolve_read_tool("does_not_exist")
