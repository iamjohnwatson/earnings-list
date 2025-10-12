from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Dict, Tuple

from flask import Flask, jsonify, render_template, request, send_file

from earnings.companies import (
    get_companies_without_ticker,
    get_sector_companies,
    get_sectors,
    get_ticker_to_name,
)
from earnings.scraper import EarningsScrapeError, fetch_weekly_earnings
from earnings.spreadsheet import generate_csv_bytes
from earnings.week_selector import get_week_options

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

_CACHE_TTL = timedelta(minutes=5)
_cache: Dict[Tuple[str, str], Dict[str, object]] = {}


class ValidationError(ValueError):
    pass


def _find_week(week_id: str) -> dict:
    for option in get_week_options():
        if option["id"] == week_id:
            return option
    raise ValidationError("Unknown week selection.")


def _validate_payload(payload: dict) -> tuple[str, dict]:
    if not payload:
        raise ValidationError("Missing request payload.")
    sector = payload.get("sector")
    week_id = payload.get("weekId") or payload.get("week")
    if not sector:
        raise ValidationError("Sector is required.")
    if sector not in get_sectors():
        raise ValidationError("Unsupported sector selection.")
    if not week_id:
        raise ValidationError("Week is required.")
    week = _find_week(str(week_id))
    return sector, week


def _should_cache_week(week: dict) -> bool:
    """Only cache for current and upcoming week to keep data fresh."""

    try:
        start = date.fromisoformat(week["start_date"])
    except (TypeError, ValueError, KeyError):
        return False
    today = date.today()
    current_week_start = today - timedelta(days=today.weekday())
    next_week_start = current_week_start + timedelta(days=7)
    return start in (current_week_start, next_week_start)


def _get_cached(sector: str, week_id: str):
    cache_key = (sector, week_id)
    entry = _cache.get(cache_key)
    if not entry:
        return None
    expires_at = entry.get("expires_at")
    if isinstance(expires_at, datetime) and expires_at > datetime.utcnow():
        return entry["data"]
    _cache.pop(cache_key, None)
    return None


def _set_cache(sector: str, week_id: str, data):
    _cache[(sector, week_id)] = {
        "data": data,
        "expires_at": datetime.utcnow() + _CACHE_TTL,
    }


def _fetch_data(sector: str, week: dict):
    cacheable = _should_cache_week(week)
    cached = _get_cached(sector, week["id"]) if cacheable else None
    if cached is not None:
        return cached

    ticker_to_name = get_ticker_to_name(sector)
    companies = get_sector_companies(sector)
    start_date = date.fromisoformat(week["start_date"])
    end_date = date.fromisoformat(week["end_date"])

    try:
        results = fetch_weekly_earnings(
            start=start_date,
            end=end_date,
            ticker_to_name=ticker_to_name,
            companies=companies,
        )
    except EarningsScrapeError as exc:
        raise ValidationError(str(exc))

    ir_companies = sorted({item["company"] for item in results if item.get("source") == "investor_relations"})
    fallback_companies = sorted({item["company"] for item in results if item.get("source") != "investor_relations"})

    metadata = {
        "records": results,
        "missing_public": get_companies_without_ticker(sector),
        "ticker_count": len(ticker_to_name),
        "generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "ir_companies": ir_companies,
        "fallback_companies": fallback_companies,
    }
    if cacheable:
        _set_cache(sector, week["id"], metadata)
    return metadata


@app.get("/")
def index():
    return render_template(
        "index.html",
        sectors=get_sectors(),
        week_options=get_week_options(),
        companies_by_sector=get_sector_companies,
    )


@app.get("/api/weeks")
def api_weeks():
    return jsonify(get_week_options())


@app.get("/api/sectors")
def api_sectors():
    sectors = []
    for sector in get_sectors():
        companies = get_sector_companies(sector)
        sectors.append({
            "name": sector,
            "count": len(companies),
            "publicCount": len([c for c in companies if c.get("ticker")]),
        })
    return jsonify(sectors)


@app.post("/api/preview")
def api_preview():
    try:
        sector, week = _validate_payload(request.get_json(silent=True) or {})
        data = _fetch_data(sector, week)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(
        {
            "records": data["records"],
            "count": len(data["records"]),
            "missingPublic": data["missing_public"],
            "tickerCount": data.get("ticker_count", 0),
            "generatedAt": data.get("generated_at"),
            "irCompanies": data.get("ir_companies", []),
            "fallbackCompanies": data.get("fallback_companies", []),
            "week": week,
            "sector": sector,
        }
    )


@app.post("/download")
def download():
    try:
        sector, week = _validate_payload(request.get_json(silent=True) or {})
        data = _fetch_data(sector, week)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400

    csv_stream = generate_csv_bytes(data["records"])
    filename = f"earnings_{sector.lower()}_{week['start_date']}.csv"
    return send_file(
        csv_stream,
        mimetype="text/csv",
        as_attachment=True,
        download_name=filename,
    )


if __name__ == "__main__":
    app.run(debug=True)
