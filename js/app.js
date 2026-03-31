/* app.js — bootstrap: loads data files, initialises all components */

const TOPO_URL      = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const GAS_URL       = "public/data/gas_prices.json";
const CRUDE_URL     = "public/data/crude_oil.json";
const STATUS_URL    = "public/data/last_updated.json";
const STALE_HOURS   = 36;

// Cache-bust all data files with a daily timestamp
const cacheBust = `?v=${Math.floor(Date.now() / 86400000)}`;

async function loadAll() {
  try {
    const [topoData, gasData, crudeData, statusData] = await Promise.all([
      d3.json(TOPO_URL),
      d3.json(GAS_URL  + cacheBust),
      d3.json(CRUDE_URL + cacheBust),
      d3.json(STATUS_URL + cacheBust),
    ]);

    // ── Stale data check ──
    if (statusData?.timestamp) {
      const age = (Date.now() - new Date(statusData.timestamp).getTime()) / 3600000;
      if (age > STALE_HOURS || statusData.status === "error") {
        document.getElementById("stale-banner").classList.remove("hidden");
      }
    }

    // ── Date in header ──
    const headerDateEl = document.getElementById("header-date");
    if (headerDateEl) {
      headerDateEl.textContent = new Date().toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric"
      });
    }

    // ── Last-updated display ──
    const updatedEl = document.getElementById("last-updated-text");
    const footerEl  = document.getElementById("footer-updated");
    if (gasData?.updated) {
      const d = new Date(gasData.updated);
      const formatted = d.toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short"
      });
      if (updatedEl) updatedEl.textContent = formatted;
      if (footerEl)  footerEl.textContent  = `Last data fetch: ${formatted}`;
    }

    // ── National average badge ──
    const avgEl = document.getElementById("national-avg-price");
    if (avgEl && gasData?.national_avg != null) {
      avgEl.textContent = `$${gasData.national_avg.toFixed(3)}`;
    }

    // ── Initialise components ──
    initMap(gasData, topoData);
    initStateTable(gasData);
    initCrudeTable(crudeData);

  } catch (err) {
    console.error("clgasmap: failed to load data", err);
    showLoadError(err);
  }
}

function showLoadError(err) {
  const main = document.querySelector(".page-main");
  if (!main) return;
  const banner = document.getElementById("stale-banner");
  if (banner) {
    banner.textContent = `⚠ Could not load map data. ${err?.message || "Please try refreshing."}`;
    banner.classList.remove("hidden");
  }
}

// Start
loadAll();
