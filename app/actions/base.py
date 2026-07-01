"""The Action primitive (proposed Decision #21) — define a capability ONCE, reuse it
across HTTP, the agent tool-loop, CLI, and (later) MCP with no per-surface boilerplate.

Learned from the Agent-Native spike; rebuilt in pure Python + Pydantic (our Zod). An
Action = name + description + a Pydantic input model + read_only flag + async handler.
A registry holds them; thin adapters read from the registry.

Everything here (registry, schema→tool conversion, read_only→verb mapping, validate-then-
dispatch) is pure and DB-free unit-testable; only the handlers touch the database.
"""
from __future__ import annotations

import inspect
import typing
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.auth import CurrentUser
    from app.llm import LLMClient


@dataclass
class ActionContext:
    """Everything a handler needs, injected once — so DSGVO user-scoping lives in a
    single place, not re-derived per surface."""

    current_user: "CurrentUser"
    user_id: str                                    # internal users.id
    session_factory: "Callable[[], AsyncSession]"   # app.db.SessionLocal
    llm: "LLMClient"
    initiator: str = "user"                         # "user" (HTTP /actions, CLI) | "agent" (BumFlow tool-call)


Handler = Callable[[BaseModel, ActionContext], Awaitable[Any]]


@dataclass
class Action:
    name: str
    description: str
    input_model: type[BaseModel]
    handler: Handler
    read_only: bool = False
    agent_writable: bool = False  # a WRITE action BumFlow may call (self-gates to 'proposed')

    @property
    def http_method(self) -> str:
        """read_only reads → GET; everything that mutates → POST."""
        return "GET" if self.read_only else "POST"

    def tool_schema(self) -> dict:
        """OpenAI/Langdock-style function-tool definition. Pydantic gives us the JSON
        Schema for free — the same model that validates HTTP input describes the tool."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_model.model_json_schema(),
            },
        }

    async def invoke(self, raw: dict | None, ctx: ActionContext) -> Any:
        """Validate raw input against the schema, THEN run the handler. Invalid input
        raises before the handler (and the DB) is ever touched."""
        inp = self.input_model.model_validate(raw or {})
        return await self.handler(inp, ctx)


class Registry:
    def __init__(self) -> None:
        self._actions: dict[str, Action] = {}

    def register(self, act: Action) -> None:
        if act.name in self._actions:
            raise ValueError(f"duplicate action: {act.name!r}")
        self._actions[act.name] = act

    def get(self, name: str) -> Action:
        if name not in self._actions:
            raise KeyError(f"unknown action: {name!r}")
        return self._actions[name]

    def all(self) -> list[Action]:
        return list(self._actions.values())

    def tool_schemas(self, *, read_only: bool | None = None) -> list[dict]:
        """Tool definitions for the agent loop; filter to the safe (read_only) subset
        when the caller only wants side-effect-free tools."""
        return [
            a.tool_schema()
            for a in self._actions.values()
            if read_only is None or a.read_only == read_only
        ]

    def agent_tool_schemas(self) -> list[dict]:
        """Tools BumFlow may call: read-only actions PLUS explicitly agent-writable ones
        (which self-gate to 'proposed'). Offer only what dispatch will run."""
        return [
            a.tool_schema()
            for a in self._actions.values()
            if a.read_only or a.agent_writable
        ]


registry = Registry()


def action(
    *, name: str, description: str, read_only: bool = False, agent_writable: bool = False
) -> Callable[[Handler], Handler]:
    """Register an async `handler(inp: PydanticModel, ctx: ActionContext)` as an Action.
    The input model is read from the handler's first parameter annotation."""

    def deco(fn: Handler) -> Handler:
        params = list(inspect.signature(fn).parameters)
        if len(params) < 2:
            raise TypeError(f"action {name!r}: handler must take (inp, ctx)")
        hints = typing.get_type_hints(fn)          # resolves string annotations too
        input_model = hints.get(params[0])
        if not (isinstance(input_model, type) and issubclass(input_model, BaseModel)):
            raise TypeError(
                f"action {name!r}: first parameter must be annotated with a Pydantic model"
            )
        registry.register(
            Action(
                name=name,
                description=description,
                input_model=input_model,
                handler=fn,
                read_only=read_only,
                agent_writable=agent_writable,
            )
        )
        return fn

    return deco
