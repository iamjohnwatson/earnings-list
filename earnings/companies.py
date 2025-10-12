"""Utilities for working with the sector/company mapping."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_DATA_PATH = _DATA_DIR / "companies.json"


class CompanyDataError(RuntimeError):
    """Raised when the companies configuration cannot be loaded."""


@lru_cache(maxsize=1)
def _load_raw() -> Dict[str, List[Dict[str, str]]]:
    data: Dict[str, List[Dict[str, str]]] = {}

    sector_files = sorted(_DATA_DIR.glob("companies_*.json"))
    if sector_files:
        for file_path in sector_files:
            try:
                with file_path.open(encoding="utf-8") as handle:
                    sector_payload = json.load(handle)
            except json.JSONDecodeError as exc:
                raise CompanyDataError(f"Invalid JSON in {file_path}") from exc

            if not isinstance(sector_payload, dict):
                raise CompanyDataError(f"Unexpected structure in {file_path}")

            for sector, entries in sector_payload.items():
                if not isinstance(entries, list):
                    raise CompanyDataError(f"Entries for {sector} in {file_path} must be a list")
                data.setdefault(sector, []).extend(entries)
    else:
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
            investor_relations_url = entry.get("investorRelationsUrl")
            normalised_entries.append({
                "name": name,
                "ticker": ticker.upper() if isinstance(ticker, str) else None,
                "investorRelationsUrl": investor_relations_url if isinstance(investor_relations_url, str) else None,
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
