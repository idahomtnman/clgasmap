#!/usr/bin/env python3
"""
fetch_data.py — Daily data fetcher for clgasmap
  - Gas prices:  AAA (gasprices.aaa.com) — daily, all 50 states, unique per state
  - Crude oil:   EIA API v2             — daily WTI + Brent spot prices (90 days)

Outputs:
  public/data/gas_prices.json   — per-state daily retail gas prices
  public/data/crude_oil.json    — WTI + Brent daily spot prices (90 days)
  public/data/last_updated.json — fetch metadata / status
"""

import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data"
LOG_DIR = ROOT / "logs"

DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "fetch.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
load_dotenv(ROOT / ".env")
API_KEY = os.getenv("EIA_API_KEY")
if not API_KEY:
    log.error("EIA_API_KEY not set. Add it to .env or environment.")
    sys.exit(1)

EIA_BASE = "https://api.eia.gov/v2"
AAA_URL  = "https://gasprices.aaa.com/state-gas-price-averages/"
TIMEOUT  = 30

WTI_PRODUCT   = "EPCWTI"
BRENT_PRODUCT = "EPCBRENT"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def write_json(path: Path, data: dict) -> None:
    """Atomic write via temp file."""
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    tmp.replace(path)
    log.info("Wrote %s", path.name)


def parse_price(raw: str) -> float | None:
    """Strip '$' and whitespace, return float or None."""
    try:
        return round(float(raw.strip().lstrip("$")), 3)
    except (ValueError, AttributeError):
        return None

# ---------------------------------------------------------------------------
# AAA gas prices — all 50 states, daily
# ---------------------------------------------------------------------------

def _parse_table(soup: BeautifulSoup) -> dict[str, dict]:
    """Primary method: parse <table id='sortable'>."""
    table = soup.find("table", {"id": "sortable"})
    if not table:
        raise ValueError("Could not find #sortable table in AAA page")

    results: dict[str, dict] = {}
    for row in table.find("tbody").find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 2:
            continue

        # State code from the href: ?state=CA
        link = cells[0].find("a")
        if not link:
            continue
        href = link.get("href", "")
        qs = parse_qs(urlparse(href).query)
        state_code = qs.get("state", [None])[0]
        if not state_code:
            # Fall back: match two-letter uppercase in query string
            m = re.search(r"state=([A-Z]{2})", href)
            state_code = m.group(1) if m else None
        if not state_code:
            continue

        def cell_price(cls: str) -> float | None:
            td = row.find("td", class_=cls)
            return parse_price(td.get_text()) if td else None

        regular   = cell_price("regular")
        mid_grade = cell_price("mid_grade")
        premium   = cell_price("premium")
        diesel    = cell_price("diesel")

        if regular is None:
            continue

        results[state_code] = {
            "regular":   regular,
            "mid_grade": mid_grade,
            "premium":   premium,
            "diesel":    diesel,
        }

    return results


def _parse_placestxt(html: str) -> dict[str, dict]:
    """
    Fallback method: extract prices from the embedded JS variable:
      placestxt: "CA,California,$5.877,url,#color;HI,Hawaii,$5.418,...;"
    Contains regular prices only.
    """
    m = re.search(r'"placestxt"\s*:\s*"([^"]+)"', html)
    if not m:
        raise ValueError("placestxt JS variable not found in AAA page")

    results: dict[str, dict] = {}
    for entry in m.group(1).split(";"):
        parts = entry.strip().split(",")
        if len(parts) < 3:
            continue
        state_code = parts[0].strip()
        price = parse_price(parts[2])
        if state_code and price is not None:
            results[state_code] = {
                "regular":   price,
                "mid_grade": None,
                "premium":   None,
                "diesel":    None,
            }

    return results


def fetch_gas_prices() -> dict:
    """
    Scrape AAA state gas price averages page.
    Returns all 50 states with regular, mid-grade, premium, and diesel prices.
    """
    log.info("Fetching AAA gas prices from %s …", AAA_URL)
    resp = requests.get(AAA_URL, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")

    # Try primary table parse; fall back to JS placestxt
    try:
        states = _parse_table(soup)
        method = "table"
        log.info("Parsed %d states from HTML table", len(states))
    except Exception as exc:
        log.warning("Table parse failed (%s), trying placestxt fallback …", exc)
        states = _parse_placestxt(resp.text)
        method = "placestxt_fallback"
        log.info("Parsed %d states from placestxt JS variable", len(states))

    if len(states) < 48:
        raise ValueError(
            f"Only {len(states)} states parsed — page structure may have changed"
        )

    # National average of regular prices across all states
    regular_prices = [v["regular"] for v in states.values() if v["regular"] is not None]
    national_avg = round(sum(regular_prices) / len(regular_prices), 3) if regular_prices else None

    return {
        "updated":      datetime.now(timezone.utc).isoformat(),
        "source":       "AAA (gasprices.aaa.com)",
        "unit":         "USD/gal",
        "parse_method": method,
        "national_avg": national_avg,
        "states":       states,
    }


# ---------------------------------------------------------------------------
# EIA crude oil prices — WTI + Brent, 90 days
# ---------------------------------------------------------------------------

def eia_get(path: str, params: dict) -> dict:
    params["api_key"] = API_KEY
    url = f"{EIA_BASE}/{path}"
    resp = requests.get(url, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def fetch_crude_oil() -> dict:
    """Fetch 90 days of daily WTI and Brent spot prices from EIA API v2."""
    params = {
        "frequency":          "daily",
        "data[0]":            "value",
        "sort[0][column]":    "period",
        "sort[0][direction]": "desc",
        "length":             "90",
    }

    results = {}
    for grade, product_code in [("wti", WTI_PRODUCT), ("brent", BRENT_PRODUCT)]:
        p = {**params, "facets[product][]": product_code}
        log.info("Fetching %s crude prices from EIA …", grade.upper())
        data = eia_get("petroleum/pri/spt/data", p)
        rows = data.get("response", {}).get("data", [])
        series = []
        for row in rows:
            val = row.get("value")
            if val is not None:
                series.append({
                    "date":  row.get("period", ""),
                    "price": round(float(val), 2),
                })
        series.reverse()  # chronological order for sparkline
        results[grade] = series
        log.info("  %s: %d data points", grade.upper(), len(series))

    return {
        "updated": datetime.now(timezone.utc).isoformat(),
        "source":  "EIA (api.eia.gov) — petroleum spot prices",
        "unit":    "USD/bbl",
        **results,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    log.info("=== clgasmap fetch started ===")
    errors = []

    # --- Gas prices (AAA) ---
    try:
        gas_data = fetch_gas_prices()
        write_json(DATA_DIR / "gas_prices.json", gas_data)
    except Exception as exc:
        log.error("Gas price fetch failed: %s", exc)
        errors.append(f"gas_prices: {exc}")

    # --- Crude oil (EIA) ---
    try:
        crude_data = fetch_crude_oil()
        write_json(DATA_DIR / "crude_oil.json", crude_data)
    except Exception as exc:
        log.error("Crude oil fetch failed: %s", exc)
        errors.append(f"crude_oil: {exc}")

    # --- Status ---
    write_json(DATA_DIR / "last_updated.json", {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status":    "error" if errors else "ok",
        "errors":    errors if errors else None,
    })

    if errors:
        log.error("Fetch completed with errors: %s", errors)
        sys.exit(1)
    else:
        log.info("=== Fetch complete — all data updated ===")


if __name__ == "__main__":
    main()
