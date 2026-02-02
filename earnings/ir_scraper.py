from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Dict, Iterable, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

_DATE_PATTERNS = [
    # January 25, 2025 / Jan. 25, 2025
    re.compile(
        r"\b("
        r"January|February|March|April|May|June|July|August|September|October|November|December|"
        r"Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sept\.?|Sep\.?|Oct\.?|Nov\.?|Dec\.?"
        r")\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4}\b",
        re.IGNORECASE,
    ),
    # 01/25/2025
    re.compile(r"\b\d{1,2}/\d{1,2}/\d{4}\b"),
    # 2025-01-25
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
]

_TIME_PATTERN = re.compile(
    r"\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?|am|pm)\s*(?:[A-Z]{2,3})?\b", re.IGNORECASE
)

_KEYWORDS = [
    "earnings",
    "results",
    "conference call",
    # "financial",  # Too generic, matches "financials" in nav/headers
    "quarter",
    "quarterly",
    "webcast",
]

_MONTH_LOOKUP = {
    "JAN": 1,
    "JANUARY": 1,
    "FEB": 2,
    "FEBRUARY": 2,
    "MAR": 3,
    "MARCH": 3,
    "APR": 4,
    "APRIL": 4,
    "MAY": 5,
    "JUN": 6,
    "JUNE": 6,
    "JUL": 7,
    "JULY": 7,
    "AUG": 8,
    "AUGUST": 8,
    "SEP": 9,
    "SEPT": 9,
    "SEPTEMBER": 9,
    "OCT": 10,
    "OCTOBER": 10,
    "NOV": 11,
    "NOVEMBER": 11,
    "DEC": 12,
    "DECEMBER": 12,
}


@dataclass
class InvestorRelationsEvent:
    symbol: str
    company: str
    date: date
    time_label: Optional[str]
    source_url: str


def _parse_date_token(token: str) -> Optional[date]:
    token = token.strip()

    dash_match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", token)
    if dash_match:
        year, month, day = map(int, dash_match.groups())
        return date(year, month, day)

    slash_match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", token)
    if slash_match:
        month, day, year = map(int, slash_match.groups())
        try:
            return date(year, month, day)
        except ValueError:
            return None

    month_match = re.fullmatch(
        r"([A-Za-z\.]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})", token
    )
    if month_match:
        month_token, day_token, year_token = month_match.groups()
        month_key = month_token.replace(".", "").upper()
        month = _MONTH_LOOKUP.get(month_key)
        if not month:
            return None
        try:
            return date(int(year_token), month, int(day_token))
        except ValueError:
            return None

    return None


def _context_has_keyword(context: str) -> bool:
    lowered = context.lower()
    return any(keyword in lowered for keyword in _KEYWORDS)


def _extract_candidates(text: str) -> List[Tuple[date, str, str]]:
    candidates: List[Tuple[date, str, str]] = []
    for pattern in _DATE_PATTERNS:
        for match in pattern.finditer(text):
            token = match.group(0)
            parsed = _parse_date_token(token)
            if not parsed:
                continue
            start = max(0, match.start() - 120)
            end = min(len(text), match.end() + 120)
            context = text[start:end]
            if not _context_has_keyword(context):
                continue
            time_match = _TIME_PATTERN.search(context)
            time_label = time_match.group(0) if time_match else ""
            candidates.append((parsed, time_label, context.strip()))
    return candidates


def _pick_event(candidates: Iterable[Tuple[date, str, str]], today: date) -> Optional[Tuple[date, str]]:
    filtered = [item for item in candidates if item[0] >= today]
    if not filtered:
        return None
    filtered.sort(key=lambda item: item[0])
    best_date, time_label, _ = filtered[0]
    return best_date, time_label


def fetch_investor_relations_events(
    session: requests.Session,
    *,
    companies: List[Dict[str, str]],
    today: Optional[date] = None,
) -> Dict[str, InvestorRelationsEvent]:
    today = today or date.today()
    results: Dict[str, InvestorRelationsEvent] = {}
    
    # Use a separate session factory or just new sessions per thread to avoid race conditions 
    # if the passed session isn't thread-safe (requests.Session is generally thread-safe but 
    # relying on a single pool might be a bottleneck). 
    # Actually, sharing one session is fine if pool size is large enough.
    # However, let's use a thread pool to parallelize.
    
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    def _fetch_one(entry: Dict[str, str]) -> Optional[InvestorRelationsEvent]:
        symbol = entry.get("ticker")
        company = entry.get("name")
        url = entry.get("investorRelationsUrl")
        if not symbol or not url:
            return None

        try:
            # We use the shared session, but requests is thread-safe.
            response = session.get(url, headers=_HEADERS, timeout=10) # Reduced timeout for speed
        except requests.RequestException as exc:
            logger.debug("IR fetch failed for %s (%s): %s", company, symbol, exc)
            return None

        if response.status_code != 200 or not response.text:
            return None

        soup = BeautifulSoup(response.text, "lxml")
        text = soup.get_text(" ", strip=True)
        if not text:
            return None

        candidates = _extract_candidates(text)
        selection = _pick_event(candidates, today)
        if not selection:
            return None

        event_date, time_label = selection
        return InvestorRelationsEvent(
            symbol=symbol,
            company=company or symbol,
            date=event_date,
            time_label=time_label or None,
            source_url=response.url or url,
        )

    # Limit max workers to avoid being flagged as a DoS or exhausting local resources
    max_workers = min(len(companies), 20) or 1
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_symbol = {
            executor.submit(_fetch_one, entry): entry.get("ticker") 
            for entry in companies
        }
        
        for future in as_completed(future_to_symbol):
            try:
                event = future.result()
                if event:
                    results[event.symbol] = event
            except Exception as exc:
                logger.debug("Worker failed: %s", exc)
                
    return results
