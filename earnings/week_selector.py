"""Helpers for building week selection options."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable, List

try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except ImportError:  # pragma: no cover - fallback for older Python
    from backports.zoneinfo import ZoneInfo  # type: ignore

_EASTERN = ZoneInfo("America/New_York")



_EARLIEST_DATE = date(2026, 1, 1)


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
    reference: date | None = None,
    min_date: date | None = None,
) -> Iterable[date]:
    """Yield the start date for each selectable week."""

    base = get_week_start(reference)
    start_boundary = min_date or _EARLIEST_DATE
    
    # Calculate how many weeks back we need to go to reach min_date
    weeks_back = 0
    current = base
    while current >= start_boundary:
        weeks_back += 1
        current -= timedelta(days=7)
    
    # We want to include the week that covers start_boundary, so we might need one more step back
    # But effectively, we just want to iterate from (base - weeks_back) up to (base + weeks_ahead)
    # Let's just generate the range directly.
    
    start_week = base - timedelta(days=7 * (weeks_back - 1))
    # Ensure we don't start before min_date (week start logic aside, we just want to cover the range)
    # Actually, the user wants "historical calendars... from Jan 1, 2026". 
    # So we should ensure the first option is the week containing Jan 1, 2026.
    
    first_week_start = get_week_start(start_boundary)
    
    current_week = first_week_start
    limit = base + timedelta(days=7 * weeks_ahead)
    
    while current_week <= limit:
        yield current_week
        current_week += timedelta(days=7)


def get_week_options(
    *,
    weeks_ahead: int = 12,
    reference: date | None = None,
) -> List[dict]:
    """Return week option dictionaries for the UI."""

    options: List[dict] = []
    # No longer using fixed weeks_back, deriving from 2026-01-01
    for start in iter_weeks(weeks_ahead=weeks_ahead, reference=reference):
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
