"""Background execution seam (DECISIONS.md #19).

v1 = in-process (no infra). The orchestrator only knows the TaskRunner interface, so
swapping to a durable arq+Redis queue later is a one-file change, not a rewrite.
"""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from typing import Protocol


class TaskRunner(Protocol):
    def run_later(self, coro: Awaitable) -> None:
        """Schedule fire-and-forget work off the request path."""
        ...


class InProcessRunner:
    """Runs the coroutine on the event loop. Jobs are lost on process restart —
    acceptable for v1; graduate to DurableRunner(arq) when a dropped job costs something."""

    def __init__(self) -> None:
        self._tasks: set[asyncio.Task] = set()

    def run_later(self, coro: Awaitable) -> None:
        task = asyncio.ensure_future(coro)
        self._tasks.add(task)                    # keep a ref so it isn't GC'd mid-flight
        task.add_done_callback(self._tasks.discard)
