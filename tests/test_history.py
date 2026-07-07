"""Pure test for the history payload mapping (roadmap F0.3)."""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.chat.repository import rows_to_history


def _row(role: str, content: str, minute: int) -> SimpleNamespace:
    return SimpleNamespace(
        role=role, content=content,
        created_at=datetime(2026, 7, 6, 9, minute, tzinfo=timezone.utc),
    )


def test_rows_to_history_reverses_to_chronological_and_serializes():
    newest_first = [_row("assistant", "b", 5), _row("user", "a", 4)]
    out = rows_to_history(newest_first)
    assert [m["content"] for m in out] == ["a", "b"]          # oldest first
    assert out[0]["role"] == "user"
    assert out[0]["created_at"] == "2026-07-06T09:04:00+00:00"  # ISO 8601


def test_rows_to_history_empty():
    assert rows_to_history([]) == []
