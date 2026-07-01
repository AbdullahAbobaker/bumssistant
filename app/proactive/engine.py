"""Proactive engine — composes context-gated, self-suppressing touchpoints.

v1 policy (see DECISIONS.md #12): INFORMATIONAL only. No coaching yet.
Each composer is a pure function of context and returns either a message string
or None. Returning None means "nothing worth saying today — stay quiet."

The scheduler (built later) will, for each confirmed proactive_rule due now, call
the matching composer and only deliver a message when it is not None.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class BriefingContext:
    """Everything a composer needs. Assembled by the caller from memory + integrations."""
    display_name: str
    tasks_due_today: list[str] = field(default_factory=list)
    overdue_tasks: list[str] = field(default_factory=list)
    meetings_today: list[str] = field(default_factory=list)
    open_blockers: list[str] = field(default_factory=list)
    is_working_day: bool = True


def compose_morning_briefing(ctx: BriefingContext) -> str | None:
    """Informational start-of-day summary. Self-suppresses on empty / non-working days."""
    if not ctx.is_working_day:
        return None
    if not (ctx.tasks_due_today or ctx.overdue_tasks or ctx.meetings_today):
        return None  # nothing to say -> don't ping

    lines = [f"Guten Morgen, {ctx.display_name}."]
    if ctx.overdue_tasks:
        lines.append(f"Überfällig ({len(ctx.overdue_tasks)}): " + ", ".join(ctx.overdue_tasks))
    if ctx.tasks_due_today:
        lines.append(f"Heute fällig ({len(ctx.tasks_due_today)}): " + ", ".join(ctx.tasks_due_today))
    if ctx.meetings_today:
        lines.append(f"Termine ({len(ctx.meetings_today)}): " + ", ".join(ctx.meetings_today))
    return "\n".join(lines)


def compose_midday_checkin(ctx: BriefingContext) -> str | None:
    """Informational midday nudge — only if there is still open, dated work."""
    remaining = ctx.overdue_tasks + ctx.tasks_due_today
    if not remaining:
        return None
    return (
        f"Zwischenstand: noch offen heute — {', '.join(remaining)}."
        + (f" Blocker: {', '.join(ctx.open_blockers)}." if ctx.open_blockers else "")
    )


def compose_end_of_day_recap(ctx: BriefingContext) -> str | None:
    """Informational end-of-day recap — surfaces what rolls into tomorrow."""
    if not ctx.is_working_day:
        return None
    carryover = ctx.overdue_tasks + ctx.tasks_due_today
    if not carryover and not ctx.open_blockers:
        return None
    lines = [f"Feierabend-Überblick, {ctx.display_name}."]
    if carryover:
        lines.append(f"Wandert auf morgen: {', '.join(carryover)}.")
    if ctx.open_blockers:
        lines.append(f"Offene Blocker: {', '.join(ctx.open_blockers)}.")
    return "\n".join(lines)


# Registry so the scheduler can dispatch by touchpoint type.
COMPOSERS = {
    "morning_briefing": compose_morning_briefing,
    "midday_checkin": compose_midday_checkin,
    "end_of_day_recap": compose_end_of_day_recap,
}
