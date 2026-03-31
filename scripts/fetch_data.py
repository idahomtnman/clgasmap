#!/usr/bin/env python3
"""
fetch_data.py — Daily EIA data fetcher for clgasmap
Writes static JSON files consumed by the front-end map.

Outputs:
  public/data/gas_prices.json  — per-state weekly retail gas prices
  public/data/crude_oil.json   — WTI + Brent daily spot prices (90 days)
  public/data/last_updated.json — fetch metadata / status
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data"
LOG_DIR = ROOT / "logs"
STATE_CODES_FILE = Path(__file__).parent / "eia_state_codes.json"

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
TIMEOUT = 30  # seconds per request

# EIA product codes for the petroleum/pri/gnd endpoint
GAS_PRODUCT = "EPM0"       # Regular Motor Gasoline (all formulations)
WTI_PRODUCT  = "EPCWTI"   # WTI Cushing spot price
BRENT_PRODUCT = "EPCBRENT" # Brent spot price

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def eia_get(path: str, params: dict) -> dict:
    """GET an EIA v2 endpoint; raises on HTTP error."""
    params["api_key"] = API_KEY
    url = f"{EIA_BASE}/{path}"
    resp = requests.get(url, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def load_state_codes() -> dict:
    with open(STATE_CODES_FILE) as f:
        return json.load(f)


def write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    tmp.replace(path)   # atomic replace
    log.info("Wrote %s", path.name)


def load_existing(path: Path) -> dict | None:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None

# ---------------------------------------------------------------------------
# Gas prices — all states in one batched request
# ---------------------------------------------------------------------------

def fetch_gas_prices(state_codes: dict) -> dict:
    """
    Fetch most-recent weekly retail regular gas price for all 50 states
    in a single EIA v2 request.  Falls back to PADD regional average for
    any state that returns no data.

    Returns dict keyed by postal code, e.g.:
      { "CA": {"price": 4.523, "period": "2026-03-24", "is_regional": False}, ... }
    """
    duoareas = list(state_codes["states"].keys())
    padd_codes = list(state_codes["padd_regions"].keys())
    all_areas = duoareas + padd_codes  # fetch regions too for fallback

    # Build params — EIA v2 accepts repeated facets as indexed keys
    params = {
        "frequency": "weekly",
        "data[0]": "value",
        "facets[product][]": GAS_PRODUCT,
        "sort[0][column]": "period",
        "sort[0][direction]": "desc",
        "length": "300",  # plenty of room for 50 states × 1 period + regions
    }
    for i, code in enumerate(all_areas):
        params[f"facets[duoarea][{i}]"] = code

    log.info("Fetching gas prices for %d state/region duoareas …", len(all_areas))
    data = eia_get("petroleum/pri/gnd/data", params)

    # Index the response: keep only the most-recent record per duoarea
    by_area: dict[str, dict] = {}
    for row in data.get("response", {}).get("data", []):
        area = row.get("duoarea", "")
        if area not in by_area:  # already sorted desc, first = latest
            val = row.get("value")
            if val is not None:
                by_area[area] = {
                    "price": round(float(val), 3),
                    "period": row.get("period", ""),
                }

    log.info("EIA returned prices for %d areas", len(by_area))

    # Map to postal codes; fall back to PADD region when state missing
    results: dict[str, dict] = {}
    missing: list[str] = []
    for eia_code, meta in state_codes["states"].items():
        postal = meta["postal"]
        if eia_code in by_area:
            results[postal] = {**by_area[eia_code], "is_regional": False}
        else:
            padd = meta["padd"]
            if padd in by_area:
                results[postal] = {**by_area[padd], "is_regional": True}
                log.warning("%s (%s): no state data, using %s regional avg",
                            postal, meta["name"], padd)
            else:
                results[postal] = None  # will be rendered as "no data"
                missing.append(postal)

    if missing:
        log.warning("No data at all for: %s", ", ".join(missing))

    # National average
    national_avg = None
    if "NUS" in by_area:
        national_avg = by_area["NUS"]["price"]
    elif results:
        prices = [v["price"] for v in results.values() if v is not None]
        if prices:
            national_avg = round(sum(prices) / len(prices), 3)

    return {
        "updated": datetime.now(timezone.utc).isoformat(),
        "unit": "USD/gal",
        "product": "Regular Unleaded (all formulations)",
        "national_avg": national_avg,
        "states": results,
    }


# ---------------------------------------------------------------------------
# Crude oil prices — WTI + Brent, 90 days
# ---------------------------------------------------------------------------

def fetch_crude_oil() -> dict:
    """
    Fetch 90 days of daily WTI and Brent spot prices.

    Returns:
      { "wti": [{"date": "2026-03-28", "price": 71.23}, ...],
        "brent": [...] }
    """
    params = {
        "frequency": "daily",
        "data[0]": "value",
        "sort[0][column]": "period",
        "sort[0][direction]": "desc",
        "length": "90",
    }

    results = {}
    for grade, product_code in [("wti", WTI_PRODUCT), ("brent", BRENT_PRODUCT)]:
        p = {**params, "facets[product][]": product_code}
        log.info("Fetching %s crude prices …", grade.upper())
        data = eia_get("petroleum/pri/spt/data", p)
        rows = data.get("response", {}).get("data", [])
        series = []
        for row in rows:
            val = row.get("value")
            if val is not None:
                series.append({
                    "date": row.get("period", ""),
                    "price": round(float(val), 2),
                })
        # Response is desc; reverse to chronological for sparkline rendering
        series.reverse()
        results[grade] = series
        log.info("  %s: %d data points", grade.upper(), len(series))

    return {
        "updated": datetime.now(timezone.utc).isoformat(),
        "unit": "USD/bbl",
        **results,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    log.info("=== clgasmap fetch started ===")
    state_codes = load_state_codes()
    errors = []

    # --- Gas prices ---
    try:
        gas_data = fetch_gas_prices(state_codes)
        write_json(DATA_DIR / "gas_prices.json", gas_data)
    except Exception as exc:
        log.error("Gas price fetch failed: %s", exc)
        errors.append(f"gas_prices: {exc}")
        # Preserve last successful file (already there if it exists)

    # --- Crude oil ---
    try:
        crude_data = fetch_crude_oil()
        write_json(DATA_DIR / "crude_oil.json", crude_data)
    except Exception as exc:
        log.error("Crude oil fetch failed: %s", exc)
        errors.append(f"crude_oil: {exc}")

    # --- Status file ---
    status = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "error" if errors else "ok",
        "errors": errors if errors else None,
    }
    write_json(DATA_DIR / "last_updated.json", status)

    if errors:
        log.error("Fetch completed with errors: %s", errors)
        sys.exit(1)
    else:
        log.info("=== Fetch complete — all data updated ===")


if __name__ == "__main__":
    main()
