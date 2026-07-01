"""Working memory: assemble the bounded context window for a turn (DECISIONS.md #17).

Strategy: inject a rolling summary of older turns + the last N raw turns. Keeps every
request cheap and bounded no matter how long the persistent thread grows.
The pure functions below are unit-tested without a DB.
"""
from __future__ import annotations

from dataclasses import dataclass

WINDOW_TURNS = 10  # keep the last N exchanges verbatim; older ones live in the summary


@dataclass
class Msg:
    role: str        # 'user' | 'assistant' | 'briefing'
    content: str


@dataclass
class Window:
    summary: str          # rolling summary of older turns ('' if none yet)
    recent: list[Msg]     # most recent turns, chronological


def build_window(
    messages: list[Msg],
    rolling_summary: str = "",
    window_turns: int = WINDOW_TURNS,
) -> Window:
    """Take the tail of the thread + the summary of everything before it.

    `window_turns` counts exchanges; we keep up to 2x messages (user+assistant).
    """
    keep = max(window_turns, 0) * 2
    recent = messages[-keep:] if keep else []
    return Window(summary=rolling_summary.strip(), recent=recent)


def needs_resummarize(total_messages: int, window_turns: int = WINDOW_TURNS) -> bool:
    """True once the thread has more turns than the window — older turns should be
    folded into rolling_summary by the async summarizer so the window stays bounded."""
    return total_messages > window_turns * 2
