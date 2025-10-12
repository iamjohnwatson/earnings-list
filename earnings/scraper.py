"""Scrapers for Nasdaq and Yahoo earnings calendars."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional, Set, Tuple

import requests
from bs4 import BeautifulSoup

from .ir_scraper import InvestorRelationsEvent, fetch_investor_relations_events

logger = logging.getLogger(__name__)

_NASDAQ_URL = "https://api.nasdaq.com/api/calendar/earnings"
_YAHOO_URL = "https://finance.yahoo.com/calendar/earnings"

_DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


class EarningsScrapeError(RuntimeError):
    """Raised when one of the source scrapers fails irrecoverably."""


def _daterange(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _normalise_call_window(label: Optional[str]) -> str:
    if not label:
        return "TBD"
    normalised = label.strip().upper()
    mapping = {
        "BEFORE MARKET OPEN": "BMO",
        "PRE-MARKET": "BMO",
        "PREMARKET": "BMO",
        "AFTER MARKET CLOSE": "AMC",
        "POST-MARKET": "AMC",
        "POST MARKET": "AMC",
        "TIME-NOT-SUPPLIED": "TBD",
        "TIME NOT SUPPLIED": "TBD",
        "TBA": "TBD",
        "TBD": "TBD",
        "DURING MARKET HOURS": "DMH",
    }
    return mapping.get(normalised, normalised)


def _fetch_nasdaq_day(session: requests.Session, day: date) -> List[dict]:
    date_str = day.isoformat()
    try:
        response = session.get(_NASDAQ_URL, params={"date": date_str}, timeout=20)
    except requests.RequestException as exc:
        raise EarningsScrapeError(f"Nasdaq request failed for {date_str}") from exc

    if response.status_code != 200:
        raise EarningsScrapeError(f"Nasdaq returned {response.status_code} for {date_str}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise EarningsScrapeError("Nasdaq response was not valid JSON") from exc

    if not isinstance(payload, dict):
        logger.warning("Nasdaq payload was not a JSON object for %s", date_str)
        return []

    data = payload.get("data")
    if not isinstance(data, dict):
        logger.info("Nasdaq returned empty payload for %s", date_str)
        return []

    rows = data.get("rows") or []
    parsed: List[dict] = []
    for row in rows or []:
        symbol = (row.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        parsed.append(
            {
                "symbol": symbol,
                "company": (row.get("name") or "").strip(),
                "time": (row.get("time") or "").strip(),
                "eps": row.get("eps"),
                "eps_forecast": row.get("epsForecast"),
                "fiscal_quarter": row.get("fiscalQuarterEnding"),
            }
        )
    return parsed


def _fetch_yahoo_day(
    session: requests.Session,
    day: date,
    tickers: Set[str],
) -> Dict[str, str]:
    params = {"day": day.isoformat()}
    try:
        response = session.get(_YAHOO_URL, params=params, timeout=20)
    except requests.RequestException as exc:
        logger.warning("Yahoo request failed for %s: %s", day, exc)
        return {}

    if response.status_code != 200:
        logger.warning("Yahoo returned status %s for %s", response.status_code, day)
        return {}

    soup = BeautifulSoup(response.text, "lxml")
    table = soup.find("table")
    if not table:
        logger.debug("Yahoo table missing for %s", day)
        return {}

    lookup: Dict[str, str] = {}
    for row in table.select("tbody tr"):
        cells = row.find_all("td")
        if len(cells) < 4:
            continue
        symbol = cells[0].get_text(strip=True).upper()
        if tickers and symbol not in tickers:
            continue
        call_time = cells[3].get_text(strip=True).upper()
        lookup[symbol] = _normalise_call_window(call_time)
    return lookup


def fetch_weekly_earnings(
    *,
    start: date,
    end: date,
    ticker_to_name: Dict[str, str],
    companies: Optional[List[Dict[str, str]]] = None,
) -> List[dict]:
    """Fetch earnings for the provided tickers between ``start`` and ``end`` inclusive."""

    if start > end:
        raise ValueError("start date must be before end date")

    session = requests.Session()
    session.headers.update(_DEFAULT_HEADERS)

    tickers = set(ticker_to_name.keys())
    results: List[dict] = []
    seen: Set[Tuple[str, date]] = set()
    lookup: Dict[Tuple[str, date], dict] = {}

    if companies:
        try:
            ir_events = fetch_investor_relations_events(
                session,
                companies=companies,
                today=date.today(),
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Investor relations fetch failed: %s", exc)
            ir_events = {}
        for symbol, event in ir_events.items():
            if event.date < date.today():
                continue
            if symbol not in tickers:
                continue
            if not (start <= event.date <= end):
                continue
            key = (symbol, event.date)
            seen.add(key)
            normalised_time = _normalise_call_window(event.time_label)
            entry = {
                "company": event.company,
                "symbol": symbol,
                "date": event.date.isoformat(),
                "bmo_amc": normalised_time,
                "nasdaq_time_label": None,
                "yahoo_time_label": None,
                "ir_time_label": event.time_label,
                "ir_source_url": event.source_url,
                "source": "investor_relations",
            }
            results.append(entry)
            lookup[key] = entry

    for day in _daterange(start, end):
        yahoo_lookup = _fetch_yahoo_day(session, day, tickers)
        try:
            nasdaq_rows = _fetch_nasdaq_day(session, day)
        except EarningsScrapeError as exc:
            logger.warning("Skipping Nasdaq data for %s: %s", day, exc)
            continue

        for row in nasdaq_rows:
            symbol = row["symbol"]
            if symbol not in tickers:
                continue
            key = (symbol, day)
            source_call = yahoo_lookup.get(symbol)
            fallback_call = _normalise_call_window(row.get("time"))

            existing = lookup.get(key)
            if existing:
                if source_call:
                    existing["yahoo_time_label"] = source_call
                    if existing.get("bmo_amc") in (None, "", "TBD"):
                        existing["bmo_amc"] = source_call
                if row.get("time"):
                    existing["nasdaq_time_label"] = row.get("time")
                    if existing.get("bmo_amc") in (None, "", "TBD"):
                        existing["bmo_amc"] = fallback_call
                continue

            if key in seen:
                continue

            seen.add(key)
            entry = {
                "company": ticker_to_name.get(symbol, row.get("company") or symbol),
                "symbol": symbol,
                "date": day.isoformat(),
                "bmo_amc": source_call or fallback_call,
                "nasdaq_time_label": row.get("time"),
                "yahoo_time_label": source_call,
                "source": "aggregator",
            }
            results.append(entry)
            lookup[key] = entry

    results.sort(key=lambda item: (item["date"], item["company"]))
    return results
