"""Action primitive package (proposed Decision #21).

Importing this package registers the built-in actions into the shared `registry`, so any
adapter (HTTP, CLI, future agent-tool/MCP) that reads the registry sees them.
"""
from app.actions.base import Action, ActionContext, Registry, action, registry
from app.actions import builtin as _builtin  # noqa: F401  registers built-in actions
from app.actions import memory_review as _memory_review  # noqa: F401  registers review actions
from app.actions import tasks as _tasks  # noqa: F401  registers task actions

__all__ = ["Action", "ActionContext", "Registry", "action", "registry"]
