from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, List
from urllib.parse import quote

from earnings.companies import (
    get_companies_without_ticker,
    get_sector_companies,
    get_sectors,
    get_ticker_to_name,
)
from earnings.scraper import EarningsScrapeError, fetch_weekly_earnings
from earnings.spreadsheet import generate_csv_bytes
from earnings.week_selector import get_week_options

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("build_static")

PROJECT_ROOT = Path(__file__).resolve().parent
DOCS_DIR = PROJECT_ROOT / "docs"
STATIC_SRC = PROJECT_ROOT / "static"
TEMPLATES_SRC = PROJECT_ROOT / "templates"


def ensure_directory(path: Path) -> None:
    """Create directory and parents if missing."""

    path.mkdir(parents=True, exist_ok=True)


def copy_static_assets() -> None:
    """Mirror static assets into docs folder."""

    import shutil

    dst = DOCS_DIR / "static"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(STATIC_SRC, dst)


def render_index(options: Dict[str, object]) -> None:
    """Render the index template with compiled options."""

    from flask import Flask, render_template

    app = Flask(__name__, template_folder=str(TEMPLATES_SRC))
    with app.app_context():
        html = render_template(
            "index.html",
            sectors=options["sectors"],
            week_options=options["weeks"],
            companies_by_sector=get_sector_companies,
        )
    (DOCS_DIR / "index.html").write_text(html, encoding="utf-8")


def serialise_weeks(weeks: Iterable[dict]) -> None:
    ensure_directory(DOCS_DIR / "api")
    weeks_path = DOCS_DIR / "api" / "weeks.json"
    weeks_path.write_text(json.dumps(list(weeks), indent=2), encoding="utf-8")


def encode_segment(value: str) -> str:
    """Return a filesystem and URL safe slug for a given value."""

    return quote(value.lower().replace(" ", "-"), safe="")


def serialise_sectors(sectors: Iterable[str]) -> Dict[str, str]:
    ensure_directory(DOCS_DIR / "api")
    sectors_payload: List[dict] = []
    slug_map: Dict[str, str] = {}
    for sector in sectors:
        slug = encode_segment(sector)
        slug_map[sector] = slug
        companies = get_sector_companies(sector)
        sectors_payload.append(
            {
                "name": sector,
                "slug": slug,
                "count": len(companies),
                "publicCount": len([c for c in companies if c.get("ticker")]),
            }
        )
    sectors_path = DOCS_DIR / "api" / "sectors.json"
    sectors_path.write_text(json.dumps(sectors_payload, indent=2), encoding="utf-8")
    return slug_map


def serialise_preview(sector: str, sector_slug: str, week: dict, data: Dict[str, object]) -> None:
    base_dir = DOCS_DIR / "api" / "preview" / week["id"]
    ensure_directory(base_dir)
    csv_filename = f"earnings_{sector_slug}_{week['start_date']}.csv"
    payload = {
        "records": data["records"],
        "count": len(data["records"]),
        "missingPublic": data["missing_public"],
        "week": week,
        "sector": sector,
        "sectorSlug": sector_slug,
        "downloadPath": f"downloads/{week['id']}/{csv_filename}",
    }
    path = base_dir / f"{sector_slug}.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def serialise_csv(sector_slug: str, week: dict, data: Dict[str, object]) -> None:
    ensure_directory(DOCS_DIR / "downloads" / week["id"])
    stream = generate_csv_bytes(data["records"])
    csv_path = DOCS_DIR / "downloads" / week["id"] / f"earnings_{sector_slug}_{week['start_date']}.csv"
    csv_path.write_bytes(stream.getbuffer())


def fetch_sector_week(sector: str, week: dict) -> Dict[str, object]:
    ticker_to_name = get_ticker_to_name(sector)
    start_date = date.fromisoformat(week["start_date"])
    end_date = date.fromisoformat(week["end_date"])
    results = fetch_weekly_earnings(start=start_date, end=end_date, ticker_to_name=ticker_to_name)
    return {
        "records": results,
        "missing_public": get_companies_without_ticker(sector),
        "ticker_count": len(ticker_to_name),
    }


def build_static_site() -> None:
    ensure_directory(DOCS_DIR)

    weeks = get_week_options()
    sectors = get_sectors()

    logger.info("Rendering template and copying static assets...")
    copy_static_assets()
    render_index({"weeks": weeks, "sectors": sectors})

    logger.info("Serialising API payloads...")
    serialise_weeks(weeks)
    sector_slugs = serialise_sectors(sectors)

    for week in weeks:
        for sector in sectors:
            logger.info("Fetching %s / %s", week["id"], sector)
            sector_slug = sector_slugs[sector]
            try:
                data = fetch_sector_week(sector, week)
            except EarningsScrapeError as exc:
                logger.error("Failed to fetch %s / %s: %s", week["id"], sector, exc)
                continue
            serialise_preview(sector, sector_slug, week, data)
            serialise_csv(sector_slug, week, data)

    logger.info("Static site build complete.")


if __name__ == "__main__":
    build_static_site()
