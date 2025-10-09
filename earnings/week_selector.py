"""Helpers for building week selection options."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable, List

try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except ImportError:  # pragma: no cover - fallback for older Python
    from backports.zoneinfo import ZoneInfo  # type: ignore

_EASTERN = ZoneInfo("America/New_York")


def _format_label(dt: date) -> str:
    return dt.strftime("%b %d").replace(" 0", " ")


def get_week_start(today: date | None = None) -> date:
    """Return the Monday for the week containing ``today``."""

    if today is None:
        today = datetime.now(tz=_EASTERN).date()
    return today - timedelta(days=today.weekday())


def iter_weeks(
    *,
    weeks_ahead: int = 12,
    weeks_back: int = 1,
    reference: date | None = None,
) -> Iterable[date]:
    """Yield the start date for each selectable week."""

    base = get_week_start(reference)
    for offset in range(-weeks_back, weeks_ahead):
        yield base + timedelta(days=7 * offset)


def get_week_options(
    *,
    weeks_ahead: int = 12,
    weeks_back: int = 1,
    reference: date | None = None,
) -> List[dict]:
    """Return week option dictionaries for the UI."""

    options: List[dict] = []
    for start in iter_weeks(weeks_ahead=weeks_ahead, weeks_back=weeks_back, reference=reference):
        end = start + timedelta(days=4)
        options.append(
            {
                "id": start.isoformat(),
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "label": f"Week of {_format_label(start)} to {_format_label(end)}",
            }
        )
    options.sort(key=lambda opt: opt["start_date"])
    return options
