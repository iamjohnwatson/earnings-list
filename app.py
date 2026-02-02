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


def _find_week_by_id(week_id: str) -> dict:
    for option in get_week_options(weeks_ahead=52):  # Ensure we search enough history/future
        if option["id"] == week_id:
            return option
    # Fallback: if we can't find it in options (maybe very old?), try to construct it if it looks like a date
    try:
        start = date.fromisoformat(week_id)
        # Assuming week_id is always Monday? strict check might be better but let's be lenient
        from earnings.week_selector import get_week_start
        actual_start = get_week_start(start)
        end = actual_start + timedelta(days=4)
        return {
            "id": actual_start.isoformat(),
            "start_date": actual_start.isoformat(),
            "end_date": end.isoformat(),
            "label": f"Custom Range",
        }
    except ValueError:
        pass
    raise ValidationError(f"Unknown week selection: {week_id}")


def _validate_payload(payload: dict) -> tuple[str, dict]:
    if not payload:
        raise ValidationError("Missing request payload.")
    sector = payload.get("sector")
    
    # Check for range selection
    start_week_id = payload.get("startWeekId")
    end_week_id = payload.get("endWeekId")
    
    # Fallback to single week selection
    if not start_week_id:
        start_week_id = payload.get("weekId") or payload.get("week")
    if not end_week_id:
        end_week_id = start_week_id

    if not sector:
        raise ValidationError("Sector is required.")
    if sector not in get_sectors() and sector != "All":
        raise ValidationError("Unsupported sector selection.")
    if not start_week_id:
        raise ValidationError("Week is required.")

    start_week_option = _find_week_by_id(str(start_week_id))
    end_week_option = _find_week_by_id(str(end_week_id)) if end_week_id != start_week_id else start_week_option
    
    # Construct a combined week object
    combined_id = start_week_option["id"]
    if start_week_option["id"] != end_week_option["id"]:
        combined_id = f"{start_week_option['id']}...{end_week_option['id']}"
        
    week_label = start_week_option["label"]
    if start_week_option["id"] != end_week_option["id"]:
         # "Week of Jan 5 to Jan 9" -> extract "Jan 5"
         # Or better, just format fresh from dates
         from earnings.week_selector import _format_label
         s = date.fromisoformat(start_week_option["start_date"])
         e = date.fromisoformat(end_week_option["end_date"])
         week_label = f"Weeks of {_format_label(s)} to {_format_label(e)}"

    week = {
        "id": combined_id,
        "start_date": start_week_option["start_date"],
        "end_date": end_week_option["end_date"],
        "label": week_label,
    }
    
    # Ensure start is before end
    if week["start_date"] > week["end_date"]:
         raise ValidationError("Start week must be before end week.")

    return sector, week


def _should_cache_week(week: dict) -> bool:
    """Only cache for current and upcoming week to keep data fresh.
       Do not cache multi-week ranges or deep history."""
    
    if "..." in week["id"]:
        return False

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


@app.get("/api/preview/<week_id>/<slug>.json")
def api_static_preview(week_id, slug):
    try:
        # Map slug back to sector name
        if slug == "all":
            sector = "All"
        else:
            # Find sector by slug
            target_sector = None
            for s in get_sectors():
                if slugify_sector(s) == slug:
                    target_sector = s
                    break
            if not target_sector:
                return jsonify({"error": "Sector not found"}), 404
            sector = target_sector
            
        # Mock the week object
        # We need to find the full week object from get_week_options
        # Note: get_week_options iterates from 2026-01-01 automatically now
        week = next((w for w in get_week_options(weeks_ahead=52) if w["id"] == week_id), None)
        if not week:
             # Fallback if not found in recent options, try to construct it or error
             # For now, let's try to reconstruct it if possible or just use what we have
             return jsonify({"error": "Week not found"}), 404

        data = _fetch_data(sector, week)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
        
    # Inject sectorSlug for client-side badge logic
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
            "sectorSlug": slug
        }
    )

def slugify_sector(value: str) -> str:
    from urllib.parse import quote
    return quote(value.lower().replace(" ", "-"), safe="")

def _fetch_data(sector: str, week: dict):
    cacheable = _should_cache_week(week)
    cached = _get_cached(sector, week["id"]) if cacheable else None
    if cached is not None:
        return cached

    if sector == "All":
        from earnings.companies import get_sectors
        companies = []
        ticker_to_name = {}
        # Map ticker -> sector for later injection
        ticker_to_sector = {}
        company_name_to_sector = {} # fallback
        
        for s in get_sectors():
             sector_companies = get_sector_companies(s)
             companies.extend(sector_companies)
             t_to_n = get_ticker_to_name(s)
             ticker_to_name.update(t_to_n)
             for t in t_to_n:
                 ticker_to_sector[t] = s
             for c in sector_companies:
                 if c.get('company'):
                     company_name_to_sector[c['company']] = s
                 
    else:
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
        # Inject sector for "All" view
        if sector == "All":
            for record in results:
                # Try to find sector by ticker first, then company name
                rec_ticker = record.get('symbol')
                rec_company = record.get('company')
                found_sector = None
                if rec_ticker in ticker_to_sector:
                     found_sector = ticker_to_sector[rec_ticker]
                elif rec_company in company_name_to_sector:
                     found_sector = company_name_to_sector[rec_company]
                
                if found_sector:
                    record['sector'] = found_sector
                else:
                    record['sector'] = 'Unknown' # Should not happen often
    except EarningsScrapeError as exc:
        raise ValidationError(str(exc))
    except EarningsScrapeError as exc:
        raise ValidationError(str(exc))

    ir_companies = sorted({item["company"] for item in results if item.get("source") == "investor_relations"})
    fallback_companies = sorted({item["company"] for item in results if item.get("source") != "investor_relations"})
    
    missing_public = []
    if sector == "All":
         from earnings.companies import get_sectors
         for s in get_sectors():
             missing_public.extend(get_companies_without_ticker(s))
         missing_public.sort()
    else:
         missing_public = get_companies_without_ticker(sector)

    metadata = {
        "records": results,
        "missing_public": missing_public,
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
