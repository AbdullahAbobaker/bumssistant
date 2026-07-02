# MCP Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the read-only registry actions as MCP tools over stdio via the official `mcp` SDK, reusing the existing action registry (no new actions).

**Architecture:** A new `app/actions/mcp_server.py` with pure, dependency-free mapping functions (`mcp_tool_defs`, `resolve_read_tool`) that are unit-tested, plus a thin `serve()` shell that lazily imports the `mcp` SDK and wires `tools/list` + `tools/call` over stdio. Read-only exposure only; `initiator="mcp"`.

**Tech Stack:** Python 3.12, Pydantic v2, the official `mcp` Python SDK (stdio), pytest.

## Global Constraints

- Python 3.10+; `from __future__ import annotations`.
- Reliability bar (CLAUDE.md): pure DB-free unit tests. Test interpreter: `/Applications/anaconda3/bin/python`; run `python -m pytest -q` via it.
- **MCP exposes READ-ONLY actions only** (spec scope). `create_task`/`confirm_memory` excluded and refused.
- **Lazy `mcp` import:** the SDK is imported INSIDE `serve()` only, so `mcp_tool_defs`/`resolve_read_tool` and their tests need no dependency installed. Keep `mcp_server.py`'s module-top imports to `app.actions.base` only; the shell's other deps (db/llm/context/`mcp`) are imported inside `serve()`/`_mcp_context()`.
- Refusal message is the generic `"tool not permitted"` — never leak an internal action name.
- Baseline: **40 tests passing**.

---

### Task 1: Pure mapping functions + tests (no `mcp` dependency)

**Files:**
- Create: `app/actions/mcp_server.py`
- Test: `tests/test_mcp_server.py` (create)

**Interfaces:**
- Consumes: `registry`, `Action` (`app/actions/base.py`); built-in actions via `import app.actions`.
- Produces: `mcp_tool_defs() -> list[dict]` (read-only actions → `{"name","description","inputSchema"}`); `resolve_read_tool(name: str) -> Action` (read-only or raise).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_mcp_server.py`:
```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `/Applications/anaconda3/bin/python -m pytest tests/test_mcp_server.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.actions.mcp_server'`

- [ ] **Step 3: Write minimal implementation**

Create `app/actions/mcp_server.py`:
```python
"""MCP adapter (Decision #21, step 5): expose READ-ONLY registry actions as MCP tools.

Pure mapping (mcp_tool_defs, resolve_read_tool) is DB- and dependency-free and unit-tested.
The mcp SDK and the context/DB deps are imported lazily inside serve()/_mcp_context(), so these
functions and their tests need no `mcp` install and touch no database.
"""
from __future__ import annotations

from app.actions.base import Action, registry


def mcp_tool_defs() -> list[dict]:
    """Read-only registry actions as MCP tool descriptors. MCP uses `inputSchema` (distinct
    from the OpenAI `tool_schema()` wrapper)."""
    return [
        {
            "name": a.name,
            "description": a.description,
            "inputSchema": a.input_model.model_json_schema(),
        }
        for a in registry.all()
        if a.read_only
    ]


def resolve_read_tool(name: str) -> Action:
    """Resolve a tool name to a read-only action, or refuse. Defense in depth: even if a client
    names a write action, it is refused here — not merely absent from the list."""
    act = registry.get(name)                          # KeyError if unknown
    if not act.read_only:
        raise PermissionError("tool not permitted")   # no internal name leaked
    return act
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (all — baseline 40 + 2 new → 42)

- [ ] **Step 5: Commit**

```bash
git add app/actions/mcp_server.py tests/test_mcp_server.py
git commit -m "feat(actions): MCP read-only tool mapping (mcp_tool_defs, resolve_read_tool)"
```

---

### Task 2: SDK server shell + `mcp` dependency + client doc (integration)

**Files:**
- Modify: `app/actions/mcp_server.py` (append `_mcp_context`, `serve`, `__main__`)
- Modify: `requirements.txt` (add `mcp`)
- Modify: `README.md` (client-registration snippet)

**Interfaces:**
- Consumes: `mcp_tool_defs`, `resolve_read_tool` (Task 1); `_to_jsonable` (`app/actions/dispatch.py`); `ActionContext` (`app/actions/base.py`); `get_or_create_user` (`app/chat/repository.py`); `get_llm` (`app/llm.py`); `SessionLocal` (`app/db.py`); `get_settings` (`app/config.py`); `CurrentUser` (`app/auth.py`).

**NOTE — this task is integration, not unit-tested.** The `serve()` stdio loop is I/O (like `LangdockLLM`'s HTTP path). The exact `mcp` SDK API below is the low-level Server API as of `mcp>=1.0`; **install `mcp` first and confirm the symbols/signatures against the actually-installed version, adapting `serve()` if they differ.** Do not invent behavior — if the installed API diverges materially, report DONE_WITH_CONCERNS describing the difference.

- [ ] **Step 1: Add the dependency and install it**

Append to `requirements.txt` (keep alphabetical grouping if the file uses one; otherwise append):
```
mcp>=1.0
```
Install into the test interpreter:
```bash
/Applications/anaconda3/bin/python -m pip install "mcp>=1.0"
```
Expected: installs `mcp` (+ `anyio`); no errors. (If disk is tight, `df -h /System/Volumes/Data` first; `mcp` is small pure-Python.)

- [ ] **Step 2: Confirm the SDK API shape**

Run:
```bash
/Applications/anaconda3/bin/python -c "from mcp.server import Server; from mcp.server.stdio import stdio_server; import mcp.types as t; print('Tool' in dir(t), 'TextContent' in dir(t))"
```
Expected: `True True`. If this errors or prints `False`, the installed API differs — inspect `python -c "import mcp.server, mcp.types; help(...)"` and adapt the `serve()` code in Step 3 accordingly (report the difference).

- [ ] **Step 3: Append the context builder + server shell**

Append to `app/actions/mcp_server.py`:
```python
async def _mcp_context():
    """Build the ActionContext for an MCP call. Local dev principal (same as the CLI);
    initiator='mcp' so any FUTURE write exposure fails closed to 'proposed'. Deps are
    imported here (not at module top) to keep the pure functions dependency-light."""
    from app.actions.base import ActionContext
    from app.auth import CurrentUser
    from app.chat.repository import get_or_create_user
    from app.config import get_settings
    from app.db import SessionLocal
    from app.llm import get_llm

    settings = get_settings()
    user = CurrentUser(
        entra_oid="dev-local-user",
        email=settings.dev_user_email,
        display_name=settings.dev_user_name,
    )
    async with SessionLocal() as s:
        user_id = await get_or_create_user(s, user)
    return ActionContext(
        current_user=user,
        user_id=user_id,
        session_factory=SessionLocal,
        llm=get_llm(settings),
        initiator="mcp",
    )


async def serve() -> None:
    """Run the stdio MCP server exposing read-only actions. Imports the mcp SDK lazily so the
    pure functions above stay dependency-free."""
    import json

    import mcp.types as types
    from mcp.server import Server
    from mcp.server.stdio import stdio_server

    from app.actions.dispatch import _to_jsonable

    server = Server("bumssistant")

    @server.list_tools()
    async def _list_tools() -> list[types.Tool]:
        return [types.Tool(**d) for d in mcp_tool_defs()]

    @server.call_tool()
    async def _call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
        act = resolve_read_tool(name)                 # KeyError/PermissionError -> SDK tool error
        ctx = await _mcp_context()
        result = _to_jsonable(await act.invoke(arguments or {}, ctx))
        return [types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False, default=str))]

    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio

    asyncio.run(serve())
```

- [ ] **Step 4: Verify module import + full suite + server constructs**

Run: `/Applications/anaconda3/bin/python -c "import app.actions.mcp_server as m; print(len(m.mcp_tool_defs()), 'read-only tools')"`
Expected: `1 read-only tools` (list_projects).
Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (still 42 — no new pytest; serve() is I/O).
Verify the SDK server builds without running the loop:
```bash
/Applications/anaconda3/bin/python -c "
import asyncio, app.actions
from mcp.server import Server
import mcp.types as t
from app.actions.mcp_server import mcp_tool_defs
tools = [t.Tool(**d) for d in mcp_tool_defs()]
print('built', len(tools), 'Tool objects:', [x.name for x in tools])
"`
```
Expected: `built 1 Tool objects: ['list_projects']` (confirms `types.Tool(**d)` accepts our `inputSchema` shape). If `Tool(**d)` raises on a field name, adjust the descriptor keys in `mcp_tool_defs` to match the installed `types.Tool` and re-run Task 1's tests.

- [ ] **Step 5: Add the client-registration doc**

Append to `README.md` a section:
```markdown
## MCP server (read-only actions)

Bumssistant exposes its read-only actions as MCP tools over stdio. Point any MCP client at:

    /Applications/anaconda3/bin/python -m app.actions.mcp_server

Example `.mcp.json` entry:

    {
      "mcpServers": {
        "bumssistant": {
          "command": "python",
          "args": ["-m", "app.actions.mcp_server"]
        }
      }
    }

Only read-only actions are exposed (e.g. `list_projects`); write actions are never offered
and are refused by the server. Runs as the local dev user.
```

- [ ] **Step 6: Commit**

```bash
git add app/actions/mcp_server.py requirements.txt README.md
git commit -m "feat(actions): MCP stdio server shell + mcp dependency + client doc"
```

---

## Final verification

- [ ] `/Applications/anaconda3/bin/python -m pytest -q` — all green (42).
- [ ] `/Applications/anaconda3/bin/python -c "import app.actions.mcp_server"` — clean.
- [ ] `git grep -n "mcp>=1.0" requirements.txt` — dependency recorded.

## Spec coverage map

| Spec section | Task |
|---|---|
| §1 pure functions (mcp_tool_defs, resolve_read_tool) | 1 |
| §2 context builder (_mcp_context, initiator="mcp") | 2 |
| §3 SDK server shell (serve + __main__, lazy import) | 2 |
| §4 `mcp` dependency | 2 |
| §5 client-registration doc | 2 |
| §6 tests (DB-free) | 1 |
