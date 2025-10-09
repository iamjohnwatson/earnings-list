"""Spreadsheet generation utilities."""

from __future__ import annotations

import csv
from datetime import datetime
from io import BytesIO, StringIO
from typing import Iterable, Mapping


def _format_date_label(date_str: str) -> str:
    """Return a friendly label like 'Monday, October 6, 2025'."""
    try:
        parsed = datetime.fromisoformat(date_str)
    except (TypeError, ValueError):
        return date_str
    return f"{parsed.strftime('%A')}, {parsed.strftime('%B')} {parsed.day}, {parsed.year}"


def _normalize_session_label(raw_value: str | None) -> str:
    """Convert upstream session labels into the BMO/AMC phrasing used in the UI."""
    if not raw_value:
        return "TBD"
    value = raw_value.strip()
    normalized = value.lower().replace("_", "-").replace(" ", "-")
    if normalized in {"time-after-hours", "after-hours", "afterhours"}:
        return "AMC"
    if normalized in {"time-pre-market", "pre-market", "premarket"}:
        return "BMO"
    if normalized in {"bmo", "amc"}:
        return normalized.upper()
    return value

_OUTPUT_FIELDS = ["Company", "BMO/AMC", "Time", "Coverage", "Reporter"]


def build_csv_rows(records: Iterable[Mapping[str, str]]) -> list[dict]:
    rows = []
    previous_date = None
    for record in records:
        current_date = record.get("date")
        if current_date and current_date != previous_date:
            # Insert a grouping row before the companies for the day.
            rows.append(
                {
                    "Company": _format_date_label(current_date),
                    "BMO/AMC": "",
                    "Time": "",
                    "Coverage": "",
                    "Reporter": "",
                }
            )
            previous_date = current_date
        rows.append(
            {
                "Company": record.get("company", ""),
                "BMO/AMC": _normalize_session_label(record.get("bmo_amc")),
                "Time": record.get("time", ""),
                "Coverage": record.get("coverage", ""),
                "Reporter": record.get("reporter", ""),
            }
        )
    return rows


def generate_csv_bytes(records: Iterable[Mapping[str, str]]) -> BytesIO:
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=_OUTPUT_FIELDS, extrasaction="ignore")
    writer.writeheader()
    for row in build_csv_rows(records):
        writer.writerow(row)
    binary = BytesIO()
    binary.write(buffer.getvalue().encode("utf-8-sig"))
    binary.seek(0)
    return binary
