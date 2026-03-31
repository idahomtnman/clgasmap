/* crude_table.js — Crude oil price table with D3 sparklines */

// ── Helpers ──────────────────────────────────────────────────────────────────

function changeClass(delta) {
  if (delta == null) return "";
  if (delta >  0.005) return "change-up";
  if (delta < -0.005) return "change-down";
  return "change-flat";
}

function fmtChange(delta, prevPrice) {
  if (delta == null || prevPrice == null || prevPrice === 0) return "—";
  const abs  = Math.abs(delta).toFixed(2);
  const pct  = Math.abs(delta / prevPrice * 100).toFixed(2);
  const sign = delta >= 0 ? "+" : "−";
  const arrow = delta >  0.005 ? "▲"
              : delta < -0.005 ? "▼"
              : "—";
  return `${arrow} $${abs} (${sign}${pct}%)`;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function drawSparkline(tdEl, prices, color) {
  const W = 130, H = 38;
  const M = { top: 4, right: 5, bottom: 4, left: 5 };
  const iW = W - M.left - M.right;
  const iH = H - M.top - M.bottom;

  const minP = d3.min(prices);
  const maxP = d3.max(prices);
  const pad  = (maxP - minP) * 0.08 || 0.5;

  const xSc = d3.scaleLinear().domain([0, prices.length - 1]).range([0, iW]);
  const ySc = d3.scaleLinear().domain([minP - pad, maxP + pad]).range([iH, 0]);

  const lineGen = d3.line()
    .x((d, i) => xSc(i))
    .y(d => ySc(d))
    .curve(d3.curveCatmullRom.alpha(0.5));

  const areaGen = d3.area()
    .x((d, i) => xSc(i))
    .y0(iH)
    .y1(d => ySc(d))
    .curve(d3.curveCatmullRom.alpha(0.5));

  const root = d3.select(tdEl).append("svg")
    .attr("width", W).attr("height", H)
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("aria-hidden", "true");

  const g = root.append("g")
    .attr("transform", `translate(${M.left},${M.top})`);

  // Area fill
  g.append("path")
    .datum(prices)
    .attr("fill", color)
    .attr("opacity", 0.12)
    .attr("d", areaGen);

  // Line
  g.append("path")
    .datum(prices)
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 1.5)
    .attr("stroke-linejoin", "round")
    .attr("d", lineGen);

  // Current-price dot
  g.append("circle")
    .attr("cx", xSc(prices.length - 1))
    .attr("cy", ySc(prices[prices.length - 1]))
    .attr("r", 3)
    .attr("fill", color)
    .attr("stroke", "var(--surface)")
    .attr("stroke-width", 1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

function initCrudeTable(crudeData) {
  const container = document.getElementById("crude-table-container");
  if (!container) return;

  if (!crudeData?.wti?.length || !crudeData?.brent?.length) {
    container.innerHTML = '<p class="loading-msg">Crude oil data unavailable.</p>';
    return;
  }

  const wtiSeries   = crudeData.wti;
  const brentSeries = crudeData.brent;

  // Current & prior prices
  function seriesStats(series) {
    const cur   = series[series.length - 1].price;
    const prev1 = series.length >= 2 ? series[series.length - 2].price : null;
    const prev7 = series.length >= 8 ? series[series.length - 8].price : null;
    const date  = series[series.length - 1].date;
    return {
      current: cur,
      delta1:  prev1 != null ? cur - prev1 : null,
      delta7:  prev7 != null ? cur - prev7 : null,
      prev1,
      prev7,
      date,
    };
  }

  const wti   = seriesStats(wtiSeries);
  const brent = seriesStats(brentSeries);

  // Trend color over full 90-day window
  function trendColor(series) {
    const first = series[0].price;
    const last  = series[series.length - 1].price;
    return last > first + 0.05 ? "#e05252"
         : last < first - 0.05 ? "#52c27a"
         : "var(--text-muted)";
  }

  // Build table HTML
  container.innerHTML = `
    <table class="crude-table" aria-label="Crude oil spot prices">
      <thead>
        <tr>
          <th>Grade</th>
          <th>Spot Price</th>
          <th>1-Day</th>
          <th>7-Day</th>
          <th>90-Day Trend</th>
        </tr>
      </thead>
      <tbody>
        <tr class="crude-row" id="crude-row-wti">
          <td class="crude-grade">
            <div class="grade-abbr">WTI</div>
            <div class="grade-sub">West Texas Intermediate</div>
          </td>
          <td class="crude-price">$${wti.current.toFixed(2)}<span class="price-unit">/bbl</span></td>
          <td class="crude-change ${changeClass(wti.delta1)}">${fmtChange(wti.delta1, wti.prev1)}</td>
          <td class="crude-change ${changeClass(wti.delta7)}">${fmtChange(wti.delta7, wti.prev7)}</td>
          <td class="crude-sparkline-cell" id="sparkline-wti"></td>
        </tr>
        <tr class="crude-row" id="crude-row-brent">
          <td class="crude-grade">
            <div class="grade-abbr">Brent</div>
            <div class="grade-sub">North Sea Brent</div>
          </td>
          <td class="crude-price">$${brent.current.toFixed(2)}<span class="price-unit">/bbl</span></td>
          <td class="crude-change ${changeClass(brent.delta1)}">${fmtChange(brent.delta1, brent.prev1)}</td>
          <td class="crude-change ${changeClass(brent.delta7)}">${fmtChange(brent.delta7, brent.prev7)}</td>
          <td class="crude-sparkline-cell" id="sparkline-brent"></td>
        </tr>
        <tr class="crude-spread-row">
          <td class="crude-grade">
            <div class="grade-abbr">Spread</div>
            <div class="grade-sub">WTI – Brent</div>
          </td>
          <td class="crude-price spread-price">
            ${brent.current >= wti.current ? "−" : "+"}$${Math.abs(brent.current - wti.current).toFixed(2)}
            <span class="price-unit">/bbl</span>
          </td>
          <td colspan="3" class="spread-note">
            ${brent.current >= wti.current
              ? `Brent trades <strong>$${(brent.current - wti.current).toFixed(2)}</strong> above WTI`
              : `WTI trades <strong>$${(wti.current - brent.current).toFixed(2)}</strong> above Brent`}
            &nbsp;·&nbsp; as of ${wti.date}
          </td>
        </tr>
      </tbody>
    </table>
    <p class="crude-source">
      Source: <a href="https://www.eia.gov/opendata/" target="_blank" rel="noopener">U.S. EIA</a>
      spot prices &nbsp;·&nbsp; Data as of ${wti.date}
      &nbsp;·&nbsp; 90-day trend shown
    </p>
  `;

  // Draw sparklines after DOM is ready
  drawSparkline(
    document.getElementById("sparkline-wti"),
    wtiSeries.map(d => d.price),
    trendColor(wtiSeries)
  );
  drawSparkline(
    document.getElementById("sparkline-brent"),
    brentSeries.map(d => d.price),
    trendColor(brentSeries)
  );
}
