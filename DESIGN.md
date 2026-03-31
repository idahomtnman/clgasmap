# US Gas Price Map — Project Design Specification

**Version:** 1.0
**Date:** 2026-03-30
**Status:** Design Phase

---

## 1. Project Overview

A standalone, self-updating web page that renders a choropleth (heatmap) of average retail gasoline prices across all 50 US states, accompanied by a crude oil price table with sparkline trend charts. The page is designed to be embedded or hosted independently, with extensible content zones above and below the main map for future text, algorithmic commentary, and additional graphics.

---

## 2. Goals & Non-Goals

### Goals
- Display current average regular unleaded gasoline price per state using color heatmapping
- Auto-update daily without manual intervention
- Show crude oil (WTI & Brent) price table with recent trend sparklines
- Display data source attribution and a map legend
- Provide clearly defined extension zones for future content
- Operate as a fully static page (no backend runtime required for display)

### Non-Goals (v1)
- Real-time (sub-daily) updates
- Historical price browsing / time-scrubbing
- Mobile-specific layout optimization
- User authentication or personalization

---

## 3. Data Sources

### 3.1 Primary: U.S. Energy Information Administration (EIA) API v2

**URL:** `https://api.eia.gov/v2/`
**Auth:** Free API key — register at https://www.eia.gov/opendata/
**Rate limit:** 5,000 requests/day (free tier)
**License:** Public domain (U.S. government data)

#### 3.1.1 State-Level Gasoline Prices

| Parameter | Value |
|-----------|-------|
| Endpoint | `GET https://api.eia.gov/v2/petroleum/pri/gnd/data/` |
| `frequency` | `weekly` |
| `data[0]` | `value` |
| `facets[product][]` | `EPM0` (all grades, all formulations, regular) |
| `facets[duoarea][]` | State codes (e.g. `SCA`, `SFL`, `STX` …) |
| `sort[0][column]` | `period` |
| `sort[0][direction]` | `desc` |
| `length` | `1` (most recent week per state) |
| `api_key` | `{YOUR_KEY}` |

**State duoarea codes:** EIA uses 2-letter PADD region prefixes + state postal codes. Full mapping table must be maintained in `data/eia_state_codes.json`.

**Update cadence:** EIA publishes Monday of each week for the prior week's average. Data is typically 1–3 days behind the nominal week-end date.

**Unit:** Dollars per gallon (USD/gal), 3 decimal places.

**Example single-state query:**
```
https://api.eia.gov/v2/petroleum/pri/gnd/data/?frequency=weekly&data[0]=value&facets[product][]=EPM0&facets[duoarea][]=SCA&sort[0][column]=period&sort[0][direction]=desc&length=1&api_key=YOUR_KEY
```

**Batch approach:** Single query with `facets[duoarea][]=S{XX}` for all states in one call (EIA v2 supports multi-value facets). This reduces API calls to 1 per update cycle for gas prices.

#### 3.1.2 WTI Crude Oil Price

| Parameter | Value |
|-----------|-------|
| Endpoint | `GET https://api.eia.gov/v2/petroleum/pri/spt/data/` |
| `frequency` | `daily` |
| `data[0]` | `value` |
| `facets[product][]` | `EPCWTI` (WTI Cushing spot) |
| `sort[0][column]` | `period` |
| `sort[0][direction]` | `desc` |
| `length` | `90` (90 days for sparkline history) |

**Unit:** USD per barrel.

#### 3.1.3 Brent Crude Oil Price

| Parameter | Value |
|-----------|-------|
| Endpoint | `GET https://api.eia.gov/v2/petroleum/pri/spt/data/` |
| `facets[product][]` | `EPCBRENT` (Brent spot) |
| Same other params as WTI |

### 3.2 Secondary / Fallback: FRED (Federal Reserve Economic Data)

**URL:** `https://api.stlouisfed.org/fred/series/observations`
**Auth:** Free API key — register at https://fred.stlouisfed.org/docs/api/api_key.html
**Series IDs:**
- `GASREGCOVW` — US regular conventional gas, weekly (national average, not per-state)
- `DCOILWTICO` — WTI crude oil daily spot price
- `DCOILBRENTEU` — Brent crude daily spot price

**Use case:** FRED serves as a fallback/cross-check for crude oil prices if EIA API is unavailable. State-level gas data is not available via FRED.

### 3.3 Attribution Note (on-page)
> "Gas price data: U.S. Energy Information Administration (EIA), weekly retail prices.
> Crude oil spot prices: EIA petroleum spot prices.
> Data typically lags 1–3 days. Last updated: {timestamp}."

---

## 4. Data Pipeline

### 4.1 Architecture
```
[Cron Job: daily 8:00 AM ET]
        │
        ▼
  fetch_data.py
  ├── GET EIA gas prices (all states, 1 week)
  ├── GET EIA WTI crude (90 days)
  ├── GET EIA Brent crude (90 days)
  ├── Validate & normalize
  └── Write → public/data/gas_prices.json
                         crude_oil.json
                         last_updated.json
        │
        ▼
  index.html (static, reads JSON on load)
```

### 4.2 Data Fetcher: `scripts/fetch_data.py`

- **Language:** Python 3.11+
- **Dependencies:** `requests`, `python-dotenv`
- **Config:** `.env` file with `EIA_API_KEY`
- **Output files:**
  - `public/data/gas_prices.json` — `{ "updated": "ISO8601", "unit": "USD/gal", "states": { "CA": 4.123, "TX": 3.021, ... } }`
  - `public/data/crude_oil.json` — `{ "updated": "ISO8601", "wti": [{"date":"2026-03-28","price":71.23}, ...], "brent": [...] }`
- **Error handling:** On API failure, retain last successful JSON; write error flag to `last_updated.json`
- **Logging:** `logs/fetch.log` with timestamp, status, prices fetched

### 4.3 Scheduler Options (choose one)

| Option | Setup | Use Case |
|--------|-------|----------|
| **macOS launchd plist** | `~/Library/LaunchAgents/com.clgasmap.fetch.plist` | Local/dev machine hosting |
| **cron** | `0 8 * * * cd /path/to/clgasmap && python scripts/fetch_data.py` | Linux server |
| **GitHub Actions** | `.github/workflows/update_data.yml` — schedule: `cron: '0 13 * * *'` | GitHub Pages hosting (free) |

**Recommended:** GitHub Actions + GitHub Pages — fully free, zero infrastructure, auto-deploys on data update.

---

## 5. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Map rendering | **D3.js v7** + **TopoJSON v3** | Full control over choropleth, projection, state labels |
| US map geometry | `us-10m.json` from `topojson/us-atlas` | 10m resolution, ~100KB, includes state boundaries |
| Sparklines | **D3.js** (SVG line chart) | Consistent with map library, no extra dependency |
| Styling | **CSS custom properties** | Theming without a framework; keeps bundle small |
| Page framework | **Vanilla HTML/CSS/JS** | No build step; works as a single self-contained file |
| Data format | Static JSON files | No server runtime; CDN-cacheable |
| Color scale | `d3.scaleSequential(d3.interpolateRdYlGn)` inverted | Standard heatmap: green=low, red=high |
| Fonts | System font stack or Google Fonts (Roboto) | Fast load |

**Total estimated JS payload:** ~250KB (D3 ~180KB + TopoJSON ~30KB + app ~40KB)

---

## 6. Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  HEADER ZONE (extensible)                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Page title + optional algorithmic headline     │   │
│  │  [SLOT: text block / alert banner / ad]         │   │
│  └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  MAIN MAP SECTION                                       │
│  ┌──────────────────────────────────┐  ┌────────────┐  │
│  │                                  │  │  LEGEND    │  │
│  │   US CHOROPLETH MAP              │  │  ─────     │  │
│  │   (D3 + TopoJSON)                │  │  $2.50     │  │
│  │                                  │  │    ■ green  │  │
│  │   States colored by avg gas      │  │    ■       │  │
│  │   price; tooltip on hover        │  │    ■       │  │
│  │                                  │  │    ■       │  │
│  │   State labels: 2-letter abbrev  │  │    ■ red   │  │
│  │   on larger states               │  │  $5.50     │  │
│  │                                  │  │            │  │
│  └──────────────────────────────────┘  └────────────┘  │
│  Data source attribution + last-updated timestamp       │
├─────────────────────────────────────────────────────────┤
│  CRUDE OIL SECTION                                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │  CRUDE OIL PRICES PER BARREL                    │   │
│  │  ┌──────────┬──────────┬────────────────────┐  │   │
│  │  │ Grade    │ Price    │ 90-Day Trend        │  │   │
│  │  ├──────────┼──────────┼────────────────────┤  │   │
│  │  │ WTI      │ $71.23   │  ∿∿∿∿∿∿[sparkline] │  │   │
│  │  │ Brent    │ $74.05   │  ∿∿∿∿∿∿[sparkline] │  │   │
│  │  └──────────┴──────────┴────────────────────┘  │   │
│  │  WTI–Brent spread: $2.82                        │   │
│  └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  FOOTER ZONE (extensible)                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  [SLOT: additional graphics / analysis / ads]   │   │
│  └─────────────────────────────────────────────────┘   │
│  Sources | Methodology | Last updated: {datetime}       │
└─────────────────────────────────────────────────────────┘
```

### 6.1 Responsive Breakpoints

| Viewport | Map layout | Crude oil table |
|----------|-----------|-----------------|
| ≥1200px | Map + legend side-by-side | Full table with sparklines |
| 768–1199px | Map full width, legend below | Full table |
| <768px | Map full width, scrollable | Stacked rows |

---

## 7. Feature Specification

### 7.1 Choropleth Map

| Feature | Detail |
|---------|--------|
| Projection | `d3.geoAlbersUsa()` — standard continental US with AK/HI insets |
| Color scale | `d3.scaleSequential` → `d3.interpolateRdYlGn` reversed (red=expensive, green=cheap) |
| Domain | Dynamic: min/max of current week's state prices, with 5th/95th percentile clamping to prevent outliers from collapsing the scale |
| Missing data | States with no EIA data shown in `#cccccc` with tooltip "Data unavailable" |
| Hover tooltip | State name, price ($/gal), rank (e.g., "3rd highest"), % vs national avg |
| Click behavior | Reserved for future drill-down (v2) |
| State labels | Abbreviated postal codes on states where centroid bounding box ≥ threshold; Hawaii/Alaska labeled outside inset |
| Borders | State borders in `rgba(255,255,255,0.4)` at 0.5px; no county borders |
| Alaska/Hawaii | Standard D3 AlbersUsa inset positioning |

### 7.2 Legend

| Feature | Detail |
|---------|--------|
| Type | Continuous gradient bar + discrete tick marks |
| Position | Right of map on desktop, below map on mobile |
| Labels | Dollar amounts at 5 evenly-spaced stops across current price range |
| Annotation | "$/gallon — Regular Unleaded" |
| National avg marker | Tick mark + label on gradient at national average price |

### 7.3 Crude Oil Table

| Column | Content |
|--------|---------|
| Grade | WTI (West Texas Intermediate), Brent Crude |
| Current price | Most recent available close, formatted `$XX.XX/bbl` |
| 1-day change | `▲ $0.42 (+0.59%)` or `▼` with color coding |
| 7-day change | Same format |
| 90-day sparkline | Inline SVG, 120×30px, line chart, no axes, current price dot |

**WTI–Brent Spread row:** Calculated field, `|WTI − Brent|`, with direction note.

### 7.4 Auto-Update

| Mechanism | Behavior |
|-----------|----------|
| Data freshness | Page reads `last_updated.json` on load; compares to current date |
| Stale warning | If data is >36 hours old, banner: "Note: Data may be delayed" |
| Client-side refresh | No auto-reload; user reloads page to get latest |
| Cache-busting | JSON files fetched with `?v={unix_timestamp}` appended |

### 7.5 Extension Slots

Two clearly marked `<section>` elements with IDs:
- `#content-above` — above map, initially empty or with page title
- `#content-below` — below crude oil table, initially empty

These accept:
- Static HTML injected at build time
- Dynamically generated text (e.g., LLM-generated weekly analysis)
- Additional D3 charts or embedded graphics

### 7.6 Sources & Attribution

Fixed footer section containing:
- EIA API citation with link
- EIA data license statement (public domain)
- Methodology note: "State prices are weekly averages for regular unleaded gasoline at self-service stations"
- Last updated timestamp (from `last_updated.json`)
- GitHub repo link (optional)

---

## 8. File Structure

```
clgasmap/
├── index.html                  # Single-page app entry point
├── css/
│   └── style.css               # All styles; CSS custom properties for theming
├── js/
│   ├── app.js                  # Bootstrap: loads data, initializes components
│   ├── map.js                  # D3 choropleth map module
│   ├── legend.js               # Legend component
│   ├── crude_table.js          # Crude oil table + sparklines
│   └── tooltip.js              # Shared tooltip utility
├── public/
│   └── data/
│       ├── gas_prices.json     # Generated daily by fetch script
│       ├── crude_oil.json      # Generated daily by fetch script
│       └── last_updated.json   # Metadata: timestamp, fetch status
├── scripts/
│   ├── fetch_data.py           # Daily data fetcher
│   ├── requirements.txt        # requests, python-dotenv
│   └── eia_state_codes.json    # EIA duoarea code → state postal mapping
├── .env.example                # EIA_API_KEY=your_key_here
├── .github/
│   └── workflows/
│       └── update_data.yml     # GitHub Actions daily cron
├── DESIGN.md                   # This document
└── README.md
```

---

## 9. EIA State Code Mapping

EIA v2 uses "duoarea" codes that prefix state postal codes with `S` (e.g., `SCA` = California, `STX` = Texas). A complete 50-state mapping JSON file is required in `scripts/eia_state_codes.json`. The fetcher loops through all 50 codes in a single batched API request.

**Note:** Not all states have EIA retail price data. States without dedicated EIA series (typically low-population states) may fall back to their PADD regional average. The design must handle `null` values gracefully.

---

## 10. Color & Visual Design

| Element | Value |
|---------|-------|
| Background | `#0f1117` (dark) or `#f8f9fa` (light) — toggle via CSS variable |
| Map background | `#1a1d27` (ocean / non-state area) |
| Color scale low | `#2ecc71` (green, ~$2.50/gal) |
| Color scale mid | `#f39c12` (amber, ~$3.75/gal) |
| Color scale high | `#e74c3c` (red, ~$5.50/gal) |
| State borders | `rgba(255,255,255,0.3)` |
| Tooltip | Dark card with `rgba(0,0,0,0.85)`, white text, rounded corners |
| Sparkline up | `#e74c3c` |
| Sparkline down | `#2ecc71` |
| Sparkline neutral | `#95a5a6` |
| Typography | `"Roboto", system-ui, sans-serif` |

---

## 11. GitHub Actions Workflow (if using GitHub Pages)

```yaml
# .github/workflows/update_data.yml
name: Update Gas Price Data
on:
  schedule:
    - cron: '0 13 * * *'   # 8:00 AM ET (UTC-5) daily
  workflow_dispatch:         # Allow manual trigger

jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r scripts/requirements.txt
      - run: python scripts/fetch_data.py
        env:
          EIA_API_KEY: ${{ secrets.EIA_API_KEY }}
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with: { path: '.' }
      - uses: actions/deploy-pages@v4
```

Secret `EIA_API_KEY` stored in GitHub repository Settings → Secrets.

---

## 12. Open Questions / Decisions Before Build

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Hosting target | GitHub Pages, local server, VPS | **GitHub Pages** (free, no infra) |
| 2 | Dark/light theme | Dark only, light only, toggle | **Dark default**, CSS var toggle available |
| 3 | National average line on map | Yes / No | **Yes** — national avg in legend |
| 4 | State price labels on map | Always / hover only / never | **Hover only** (avoids clutter) |
| 5 | Historical gas price sparklines per state | v1 / v2 | **v2** — out of scope for now |
| 6 | PADD regional averages for states without data | Yes / no / note only | **Show regional avg with asterisk** |
| 7 | Diesel prices in addition to regular | v1 / v2 | **v2** — EIA has this data |
| 8 | Mobile-first or desktop-first | Desktop / Mobile | **Desktop-first**, responsive to 360px |

---

## 13. Implementation Phases

| Phase | Deliverables |
|-------|-------------|
| **Phase 1** | `fetch_data.py` + EIA integration; validate JSON output for all 50 states + crude oil |
| **Phase 2** | `index.html` + D3 choropleth map with legend, tooltip, color scale |
| **Phase 3** | Crude oil table with sparklines |
| **Phase 4** | GitHub Actions workflow; test end-to-end daily update |
| **Phase 5** | Responsive CSS polish; stale data banner; attribution footer |
| **Phase 6** | Extension slot documentation + example usage |
