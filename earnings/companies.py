"""Utilities for working with the sector/company mapping."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "companies.json"


class CompanyDataError(RuntimeError):
    """Raised when the companies configuration cannot be loaded."""


@lru_cache(maxsize=1)
def _load_raw() -> Dict[str, List[Dict[str, str]]]:
    if not _DATA_PATH.exists():
        raise CompanyDataError(f"Companies file not found at {_DATA_PATH}")
    try:
        with _DATA_PATH.open(encoding="utf-8") as handle:
            data = json.load(handle)
    except json.JSONDecodeError as exc:
        raise CompanyDataError("Invalid JSON in companies file") from exc

    normalised: Dict[str, List[Dict[str, str]]] = {}
    for sector, entries in data.items():
        normalised_entries: List[Dict[str, str]] = []
        for entry in entries:
            name = entry.get("name")
            ticker = entry.get("ticker")
            if not name:
                continue
            normalised_entries.append({
                "name": name,
                "ticker": ticker.upper() if isinstance(ticker, str) else None,
            })
        normalised[sector] = normalised_entries
    return normalised


def get_sectors() -> List[str]:
    """Return the list of configured sector names."""

    return sorted(_load_raw().keys())


def get_sector_companies(sector: str) -> List[Dict[str, str]]:
    """Return the company entries for the requested sector."""

    data = _load_raw()
    return data.get(sector, [])


def get_sector_tickers(sector: str) -> List[str]:
    """Return the list of tradable tickers for the sector (excludes private firms)."""

    return [entry["ticker"] for entry in get_sector_companies(sector) if entry.get("ticker")]


def get_ticker_to_name(sector: str) -> Dict[str, str]:
    """Return a mapping from ticker symbol to canonical company name."""

    mapping: Dict[str, str] = {}
    for entry in get_sector_companies(sector):
        ticker = entry.get("ticker")
        if ticker:
            mapping[ticker] = entry["name"]
    return mapping


def get_companies_without_ticker(sector: str) -> List[str]:
    """Return sector companies that are not currently publicly traded."""

    return [entry["name"] for entry in get_sector_companies(sector) if not entry.get("ticker")]
