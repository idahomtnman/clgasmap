/* legend.js — color legend for the choropleth map */

function drawLegend(colorScale, minPrice, maxPrice, nationalAvg) {
  const BAR_W  = 18;
  const BAR_H  = 200;
  const LEFT   = 30;   // x offset for the bar
  const TOP    = 30;   // y offset for the bar
  const TICKS  = 5;

  const svgEl = document.getElementById("legend-svg");
  const totalH = TOP + BAR_H + 50;
  svgEl.setAttribute("height", totalH);
  svgEl.setAttribute("viewBox", `0 0 110 ${totalH}`);

  const svg = d3.select("#legend-svg");
  svg.selectAll("*").remove();

  // ── Gradient definition ──
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient")
    .attr("id", "legend-grad")
    .attr("x1", "0%").attr("y1", "0%")
    .attr("x2", "0%").attr("y2", "100%");

  // Sample the color scale along the bar (top = expensive = red, bottom = cheap = green)
  d3.range(0, 1.01, 0.05).forEach(t => {
    grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", colorScale(maxPrice - t * (maxPrice - minPrice)));
  });

  // ── Title ──
  svg.append("text")
    .attr("class", "legend-title")
    .attr("x", LEFT + BAR_W / 2)
    .attr("y", TOP - 10)
    .attr("text-anchor", "middle")
    .text("$/gal");

  // ── Gradient bar ──
  svg.append("rect")
    .attr("x", LEFT)
    .attr("y", TOP)
    .attr("width", BAR_W)
    .attr("height", BAR_H)
    .attr("rx", 3)
    .attr("fill", "url(#legend-grad)");

  // ── Tick scale (price → y position on bar) ──
  const yScale = d3.scaleLinear()
    .domain([maxPrice, minPrice])   // top = high price, bottom = low
    .range([TOP, TOP + BAR_H]);

  // ── Tick marks + labels ──
  const tickPrices = d3.range(TICKS).map(i =>
    minPrice + (i / (TICKS - 1)) * (maxPrice - minPrice)
  );

  tickPrices.forEach(price => {
    const y = yScale(price);

    // Tick line
    svg.append("line")
      .attr("x1", LEFT + BAR_W)
      .attr("y1", y)
      .attr("x2", LEFT + BAR_W + 5)
      .attr("y2", y)
      .attr("stroke", "rgba(255,255,255,0.4)")
      .attr("stroke-width", 1);

    // Label
    svg.append("text")
      .attr("class", "legend-label")
      .attr("x", LEFT + BAR_W + 8)
      .attr("y", y)
      .attr("dominant-baseline", "middle")
      .text(`$${price.toFixed(2)}`);
  });

  // ── National average marker ──
  if (nationalAvg != null && nationalAvg >= minPrice && nationalAvg <= maxPrice) {
    const y = yScale(nationalAvg);

    // Arrow / marker
    svg.append("polygon")
      .attr("points", `${LEFT - 7},${y} ${LEFT - 1},${y - 4} ${LEFT - 1},${y + 4}`)
      .attr("fill", "#ffffff");

    svg.append("line")
      .attr("x1", LEFT - 1)
      .attr("y1", y)
      .attr("x2", LEFT + BAR_W)
      .attr("y2", y)
      .attr("stroke", "rgba(255,255,255,0.7)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2");

    svg.append("text")
      .attr("class", "legend-national-label")
      .attr("x", LEFT - 9)
      .attr("y", y - 6)
      .attr("text-anchor", "middle")
      .attr("font-size", "8px")
      .attr("fill", "rgba(255,255,255,0.75)")
      .text("nat'l");

    svg.append("text")
      .attr("class", "legend-national-label")
      .attr("x", LEFT - 9)
      .attr("y", y + 13)
      .attr("text-anchor", "middle")
      .attr("font-size", "8px")
      .attr("fill", "rgba(255,255,255,0.75)")
      .text(`$${nationalAvg.toFixed(2)}`);
  }

  // ── Border around bar ──
  svg.append("rect")
    .attr("x", LEFT)
    .attr("y", TOP)
    .attr("width", BAR_W)
    .attr("height", BAR_H)
    .attr("rx", 3)
    .attr("fill", "none")
    .attr("stroke", "rgba(255,255,255,0.15)")
    .attr("stroke-width", 1);

  // ── Low / High labels at bottom ──
  svg.append("text")
    .attr("class", "legend-label")
    .attr("x", LEFT + BAR_W / 2)
    .attr("y", TOP + BAR_H + 14)
    .attr("text-anchor", "middle")
    .attr("font-size", "9px")
    .attr("fill", "#ffd700")
    .text("▲ lower");

  svg.append("text")
    .attr("class", "legend-label")
    .attr("x", LEFT + BAR_W / 2)
    .attr("y", TOP - 22)
    .attr("text-anchor", "middle")
    .attr("font-size", "9px")
    .attr("fill", "#e74c3c")
    .text("▼ higher");
}
