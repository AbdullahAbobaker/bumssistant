# Design: MCP adapter (Action primitive, step 5)

**Date:** 2026-07-01
**Status:** Approved (brainstorming) — ready for implementation plan
**Relates to:** Decision #21 (Action primitive) — this is the final surface in its migration
path. Reuses the registry, `is_agent_tool`, `dispatch`/`_to_jsonable`, `ActionContext`.

## Goal

Expose the existing action registry as MCP tools so an external MCP client (e.g. another
Claude/agent) can call Bumssistant actions over the same registry — no new action
definitions. One definition, another surface.

## Scope decisions (settled in brainstorming)

- **Read-only exposure only.** MCP v1 exposes only `read_only` actions (`list_projects`
  today). Over local stdio there is no per-user auth, so an external client must never mutate
  memory. `create_task`/`confirm_memory` are excluded. Writes-over-MCP wait for real auth.
- **Official `mcp` Python SDK, stdio transport.** Correct protocol (initialize handshake,
  `tools/list`, `tools/call`) beats hand-rolling JSON-RPC. Added to `requirements.txt`.
- **Pure mapping + thin I/O shell.** The registry→tool-descriptor mapping and the
  name→action resolution are pure functions (DB-free unit-tested); the SDK server loop is the
  only I/O (not unit-tested, mirroring how `LangdockLLM`'s HTTP path is left to integration).

## Architecture

New module `app/actions/mcp_server.py`.

### 1. Pure functions (unit-tested)

```python
def mcp_tool_defs() -> list[dict]:
    """Read-only registry actions as MCP tool descriptors. MCP uses `inputSchema`
    (distinct from the OpenAI `tool_schema()` shape)."""
    return [
        {"name": a.name, "description": a.description,
         "inputSchema": a.input_model.model_json_schema()}
        for a in registry.all()
        if a.read_only
    ]


def resolve_read_tool(name: str) -> Action:
    """Resolve a tool name to a read-only action, or refuse. Defense in depth: even if a
    client names a write action, it is refused here (not just absent from the list)."""
    act = registry.get(name)                       # KeyError if unknown
    if not act.read_only:
        raise PermissionError("tool not permitted")  # no internal name leaked
    return act
```

Exposure predicate is `read_only` (NOT `is_agent_tool`): MCP is stricter than BumFlow's own
loop — reads only.

### 2. Context builder

```python
def _mcp_context() -> ActionContext:
    settings = get_settings()
    user = CurrentUser(entra_oid="dev-local-user", email=settings.dev_user_email,
                       display_name=settings.dev_user_name)
    async with SessionLocal() as s:
        user_id = await get_or_create_user(s, user)   # (async; see note)
    return ActionContext(current_user=user, user_id=user_id,
                        session_factory=SessionLocal, llm=get_llm(settings), initiator="mcp")
```

- Local dev principal (same as the CLI adapter). Reads are scoped to this user.
- `initiator="mcp"`: honest for audit, and via the fail-closed `_task_provenance` any *future*
  accidental write exposure would land `proposed`, never auto-confirmed.
- (Async detail: context/user resolution happens inside the async `call_tool` handler; the
  snippet above is illustrative — the plan will place the `await` correctly.)

### 3. SDK server shell (`serve()` + `__main__`)

Wire the official `mcp` SDK stdio server:
- `list_tools` handler → returns `mcp_tool_defs()` as the SDK's `Tool` objects.
- `call_tool(name, arguments)` handler → `act = resolve_read_tool(name)`; build the MCP
  context; `result = await act.invoke(arguments, ctx)`; return
  `_to_jsonable(result)` as MCP text content (JSON-encoded).
- Entry point: `python -m app.actions.mcp_server` (stdio).
- **Lazy SDK import:** `import mcp …` happens INSIDE `serve()`, not at module top. So the
  pure functions (`mcp_tool_defs`, `resolve_read_tool`) — and their tests — import cleanly
  without the `mcp` dependency installed, keeping the reliability-bar tests dependency-light.

### 4. Dependency

Add `mcp` to `requirements.txt` (pure-Python; brings anyio, already-present pydantic/httpx).

### 5. Client registration (doc)

A README/doc snippet showing a client (e.g. Claude Code `.mcp.json`) pointing at
`python -m app.actions.mcp_server` over stdio. No code — documentation only.

## Data flow (external client lists + calls a tool)

1. Client connects over stdio; SDK does the initialize handshake.
2. `tools/list` → `mcp_tool_defs()` → `[{list_projects, …read-only only}]`.
3. `tools/call list_projects {}` → `resolve_read_tool("list_projects")` (read-only ✓) →
   `_mcp_context()` (dev user, initiator="mcp") → `act.invoke({}, ctx)` → `_to_jsonable` →
   JSON text content back to the client.
4. `tools/call create_task …` → `resolve_read_tool` raises `PermissionError` → surfaced as an
   MCP tool error (no internal name leaked). Never reaches a handler/DB.

## Error handling

- Unknown tool → `registry.get` raises `KeyError` → SDK returns a tool error.
- Write tool named → `PermissionError("tool not permitted")` (generic message).
- Action raises → surfaced as an MCP tool error; server stays up.

## Testing (all pure, DB-free — CLAUDE.md bar)

1. `mcp_tool_defs()` includes `list_projects` with `name`/`description`/`inputSchema` keys
   (and `inputSchema` == `list_projects` input model's JSON schema); **excludes** `create_task`
   and `confirm_memory`.
2. `resolve_read_tool("list_projects")` returns the action; `resolve_read_tool("create_task")`
   raises `PermissionError` and the message contains no internal name;
   `resolve_read_tool("nope")` raises `KeyError` — all before any DB/ctx use.
3. The `mcp_tool_defs` shape uses `inputSchema` (MCP), not the OpenAI `tool_schema` shape.

The `serve()` I/O loop is exercised via manual/integration run, not pytest (documented).

## Out of scope

- Writes over MCP; per-user auth (stdio local = dev principal).
- Non-stdio transports (SSE/HTTP); prod-hosted MCP.
- Exposing `confirm_memory` or promotion (#22) — always human-gated.
