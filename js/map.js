/* map.js — D3 choropleth map of US gas prices */

// FIPS code → 2-letter postal abbreviation
const FIPS_TO_STATE = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA",
  "08":"CO","09":"CT","10":"DE","11":"DC","12":"FL",
  "13":"GA","15":"HI","16":"ID","17":"IL","18":"IN",
  "19":"IA","20":"KS","21":"KY","22":"LA","23":"ME",
  "24":"MD","25":"MA","26":"MI","27":"MN","28":"MS",
  "29":"MO","30":"MT","31":"NE","32":"NV","33":"NH",
  "34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND",
  "39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
  "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT",
  "50":"VT","51":"VA","53":"WA","54":"WV","55":"WI",
  "56":"WY"
};

// Full state names for tooltip
const STATE_NAMES = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DC:"Washington D.C.",DE:"Delaware",
  FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",
  IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",
  ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",
  NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",
  NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",
  PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",
  TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",
  WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"
};

// WCAG relative luminance → pick dark or light label color for readability
function labelColorFor(fillHex) {
  const c = d3.color(fillHex);
  if (!c) return "rgba(255,255,255,0.92)";
  const lin = x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  const L = 0.2126 * lin(c.r / 255) + 0.7152 * lin(c.g / 255) + 0.0722 * lin(c.b / 255);
  return L > 0.35 ? "rgba(0,0,0,0.82)" : "rgba(255,255,255,0.92)";
}

// Ordinal suffix helper
function ordinal(n) {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Build tooltip HTML for a state
function buildTooltip(code, data, rankMap, totalRanked, nationalAvg) {
  const name = STATE_NAMES[code] || code;

  if (!data || data.regular == null) {
    return `<div class="tt-state">${name}</div>
            <div class="tt-no-data">No data available</div>`;
  }

  const rank = rankMap[code];
  const rankClass = rank <= 5 ? "tt-rank-high" : rank >= totalRanked - 4 ? "tt-rank-low" : "";

  const pct = nationalAvg
    ? ((data.regular - nationalAvg) / nationalAvg * 100)
    : null;
  const pctStr = pct != null
    ? (pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`) + " vs nat'l avg"
    : "";

  const grades = [];
  if (data.mid_grade != null) grades.push(`<span>Mid $${data.mid_grade.toFixed(3)}</span>`);
  if (data.premium   != null) grades.push(`<span>Prem $${data.premium.toFixed(3)}</span>`);
  if (data.diesel    != null) grades.push(`<span>Diesel $${data.diesel.toFixed(3)}</span>`);

  return `
    <div class="tt-state">${name}</div>
    <div class="tt-price">$${data.regular.toFixed(3)}<small style="font-size:0.65em;color:var(--text-muted)">/gal</small></div>
    ${grades.length ? `<div class="tt-grades">${grades.join("")}</div>` : ""}
    <hr class="tt-divider">
    <div class="tt-meta">
      <span class="${rankClass}">${ordinal(rank)} most expensive</span>
      ${pctStr ? `<br>${pctStr}` : ""}
    </div>`;
}

function initMap(gasData, topoData) {
  const W = 960, H = 600;
  const svg  = d3.select("#map-svg");
  const proj = d3.geoAlbersUsa().scale(1300).translate([W / 2, H / 2]);
  const path = d3.geoPath().projection(proj);

  // ── Price data & color scale ──
  const states = gasData.states;

  const prices = Object.values(states)
    .filter(v => v?.regular != null)
    .map(v => v.regular)
    .sort(d3.ascending);

  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];

  // Slight domain padding so extreme states aren't pure red/green
  const pad = (maxPrice - minPrice) * 0.04;
  const domainMin = minPrice - pad;
  const domainMax = maxPrice + pad;

  const colorScale = d3.scaleSequential()
    .domain([domainMin, domainMax])
    .clamp(true)
    .interpolator(d3.interpolateYlOrRd);  // yellow = cheap, red = expensive

  // ── Rank map (1 = most expensive) ──
  const ranked = Object.entries(states)
    .filter(([, v]) => v?.regular != null)
    .sort(([, a], [, b]) => b.regular - a.regular);
  const rankMap = Object.fromEntries(ranked.map(([code], i) => [code, i + 1]));
  const totalRanked = ranked.length;

  // ── Draw state fills ──
  const features = topojson.feature(topoData, topoData.objects.states).features;

  svg.selectAll("path.state")
    .data(features)
    .join("path")
      .attr("class", "state")
      .attr("d", path)
      .attr("fill", d => {
        const code = FIPS_TO_STATE[String(d.id).padStart(2, "0")];
        const price = states[code]?.regular;
        return price != null ? colorScale(price) : "var(--state-no-data)";
      })
      .attr("stroke", "var(--state-border)")
      .attr("stroke-width", 0.5)
    .on("mousemove", (event, d) => {
        const code = FIPS_TO_STATE[String(d.id).padStart(2, "0")];
        showTooltip(buildTooltip(code, states[code], rankMap, totalRanked, gasData.national_avg), event);
        moveTooltip(event);
      })
    .on("mouseleave", hideTooltip);

  // ── Interior state borders (drawn over fills for crisp lines) ──
  svg.append("path")
    .datum(topojson.mesh(topoData, topoData.objects.states, (a, b) => a !== b))
    .attr("class", "state-borders")
    .attr("fill", "none")
    .attr("stroke", "rgba(255,255,255,0.18)")
    .attr("stroke-width", 0.6)
    .attr("d", path);

  // ── Label placement configuration ──

  // States where path.centroid falls in water — override with a geographic
  // coordinate that projects to a safe point inside the state's land area.
  // VT is small but entirely on land; place label at its geographic center.
  const MANUAL_CENTROIDS = {
    "MI": [-84.3, 43.3],   // south-central lower peninsula, clear of all Great Lakes
    "FL": [-81.7, 28.5],   // central Florida (Orlando area), avoids coastal water
    "VT": [-72.7, 44.0],   // geographic center of Vermont, back on the map
  };

  // Small NE/Mid-Atlantic coastal states: labels extend as callouts over the
  // Atlantic. Positions are staggered (x varies, y spaced ≥38px) to follow
  // the coastline contour and avoid overlapping background rects.
  // anchor: geographic [lon, lat] on land near eastern edge (leader-line start)
  // label:  [x, y] in 960×600 SVG space
  const CALLOUTS = {
    "NH": { anchor: [-71.3, 43.5], label: [945, 150] },
    "MA": { anchor: [-71.1, 42.4], label: [946, 185] },
    "CT": { anchor: [-72.0, 41.6], label: [919, 227] },
    "NJ": { anchor: [-74.3, 40.0], label: [898, 266] },
    "MD": { anchor: [-76.2, 39.1], label: [889, 310] },
  };

  // Return the screen point to use as the leader-line anchor (on the state)
  function anchorPt(feature) {
    const code = FIPS_TO_STATE[String(feature.id).padStart(2, "0")];
    if (code in CALLOUTS) {
      const pt = proj(CALLOUTS[code].anchor);
      return pt && isFinite(pt[0]) ? pt : path.centroid(feature);
    }
    if (code in MANUAL_CENTROIDS) {
      const pt = proj(MANUAL_CENTROIDS[code]);
      return pt && isFinite(pt[0]) ? pt : path.centroid(feature);
    }
    return path.centroid(feature);
  }

  // Return the screen position where the label group should be placed
  function labelPt(feature) {
    const code = FIPS_TO_STATE[String(feature.id).padStart(2, "0")];
    if (code in CALLOUTS) return CALLOUTS[code].label;
    return anchorPt(feature);
  }

  // Should we show labels for this state at all?
  function showLabel(feature) {
    const code = FIPS_TO_STATE[String(feature.id).padStart(2, "0")];
    if (code in CALLOUTS || code in MANUAL_CENTROIDS) return true;
    return path.area(feature) > 300;
  }

  // ── Leader lines (drawn before label groups so labels sit on top) ──
  const calloutFeatures = features.filter(d =>
    FIPS_TO_STATE[String(d.id).padStart(2, "0")] in CALLOUTS
  );

  // Helper to set line endpoints from a callout feature
  function setLineCoords(sel) {
    return sel
      .attr("x1", d => anchorPt(d)[0])
      .attr("y1", d => anchorPt(d)[1])
      .attr("x2", d => CALLOUTS[FIPS_TO_STATE[String(d.id).padStart(2, "0")]].label[0])
      .attr("y2", d => CALLOUTS[FIPS_TO_STATE[String(d.id).padStart(2, "0")]].label[1])
      .attr("pointer-events", "none");
  }

  // Dark casing drawn first (wider, provides outline contrast on light states)
  setLineCoords(
    svg.selectAll("line.callout-line-casing")
      .data(calloutFeatures)
      .join("line")
        .attr("class", "callout-line-casing")
        .attr("stroke", "rgba(0,0,0,0.65)")
        .attr("stroke-width", 4)
        .attr("stroke-linecap", "round")
  );

  // White core drawn on top
  setLineCoords(
    svg.selectAll("line.callout-line")
      .data(calloutFeatures)
      .join("line")
        .attr("class", "callout-line")
        .attr("stroke", "rgba(255,255,255,0.85)")
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round")
  );

  // Small dot at the anchor point on each callout state
  svg.selectAll("circle.callout-dot")
    .data(calloutFeatures)
    .join("circle")
      .attr("class", "callout-dot")
      .attr("cx", d => anchorPt(d)[0])
      .attr("cy", d => anchorPt(d)[1])
      .attr("r", 3)
      .attr("fill", "rgba(255,255,255,0.75)")
      .attr("pointer-events", "none");

  // ── Label groups (all states) ──
  const labelGroups = svg.selectAll("g.state-label-group")
    .data(features)
    .join("g")
      .attr("class", "state-label-group")
      .attr("visibility", d => showLabel(d) ? "visible" : "hidden")
      .attr("pointer-events", "none")
      .attr("transform", d => {
        const p = labelPt(d);
        return p && isFinite(p[0]) ? `translate(${p[0]},${p[1]})` : "translate(-9999,-9999)";
      });

  // Dark background rect for callout labels (provides contrast over the ocean)
  labelGroups.filter(d => FIPS_TO_STATE[String(d.id).padStart(2, "0")] in CALLOUTS)
    .append("rect")
      .attr("x", -26).attr("y", -17)
      .attr("width", 52).attr("height", 33)
      .attr("rx", 3)
      .attr("fill", "rgba(8,10,20,0.78)")
      .attr("stroke", "rgba(255,255,255,0.18)")
      .attr("stroke-width", 0.5);

  // Postal code label
  labelGroups.append("text")
    .attr("class", "state-label")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("y", -8)
    .attr("fill", d => {
      const code = FIPS_TO_STATE[String(d.id).padStart(2, "0")];
      if (code in CALLOUTS) return "rgba(255,255,255,0.92)";  // always light over ocean
      const price = states[code]?.regular;
      return labelColorFor(price != null ? colorScale(price) : "#3a3d50");
    })
    .text(d => FIPS_TO_STATE[String(d.id).padStart(2, "0")] || "");

  // Price label
  labelGroups.append("text")
    .attr("class", "state-price-label")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("y", 9)
    .attr("fill", d => {
      const code = FIPS_TO_STATE[String(d.id).padStart(2, "0")];
      if (code in CALLOUTS) return "rgba(255,255,255,0.82)";
      const price = states[code]?.regular;
      return labelColorFor(price != null ? colorScale(price) : "#3a3d50");
    })
    .text(d => {
      const code = FIPS_TO_STATE[String(d.id).padStart(2, "0")];
      const price = states[code]?.regular;
      return price != null ? `$${price.toFixed(2)}` : "";
    });

  // ── Legend ──
  drawLegend(colorScale, minPrice, maxPrice, gasData.national_avg);
}
