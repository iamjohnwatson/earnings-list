"""Spreadsheet generation utilities."""

from __future__ import annotations

import csv
from io import BytesIO, StringIO
from typing import Iterable, Mapping

_OUTPUT_FIELDS = ["Company", "BMO/AMC", "Time", "Coverage", "Reporter"]


def build_csv_rows(records: Iterable[Mapping[str, str]]) -> list[dict]:
    rows = []
    for record in records:
        rows.append(
            {
                "Company": record.get("company", ""),
                "BMO/AMC": record.get("bmo_amc", "TBD"),
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
