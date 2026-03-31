/**
 * debug_coords.js — temporary coordinate helper for label placement
 *
 * Adds a live (x, y) readout to the map so you can find exact SVG
 * coordinates for callout label positions.
 *
 * HOW TO USE:
 *   1. Start the local server:  python3 -m http.server 8765
 *   2. Open index.html in a browser
 *   3. Open the browser console (F12 → Console tab)
 *   4. Paste and run:
 *        var s = document.createElement('script');
 *        s.src = 'debug_coords.js?' + Date.now();
 *        document.head.appendChild(s);
 *   5. Hover over the map — live (x, y) shows in the top-left corner
 *   6. Click anywhere to PIN the coordinate (stays visible until next click)
 *   7. Tell Claude the (x, y) you want for each callout label
 *   8. When done, reload the page to remove the overlay
 */

(function () {
  const svgEl  = document.getElementById("map-svg");
  const VB_W   = 960;
  const VB_H   = 600;

  // ── Overlay display ──
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position:       "fixed",
    top:            "12px",
    left:           "12px",
    background:     "rgba(0,0,0,0.82)",
    color:          "#fff",
    fontFamily:     "monospace",
    fontSize:       "13px",
    padding:        "6px 10px",
    borderRadius:   "5px",
    border:         "1px solid rgba(255,255,255,0.25)",
    zIndex:         "9999",
    pointerEvents:  "none",
    lineHeight:     "1.5",
    minWidth:       "130px",
  });
  overlay.innerHTML = "hover over map";
  document.body.appendChild(overlay);

  // ── Crosshair lines inside the SVG ──
  const ns   = "http://www.w3.org/2000/svg";
  const hLine = document.createElementNS(ns, "line");
  const vLine = document.createElementNS(ns, "line");
  const dot   = document.createElementNS(ns, "circle");
  const pinDot = document.createElementNS(ns, "circle");

  [hLine, vLine].forEach(l => {
    l.setAttribute("stroke", "rgba(255,255,0,0.5)");
    l.setAttribute("stroke-width", "0.5");
    l.setAttribute("pointer-events", "none");
    l.setAttribute("stroke-dasharray", "4,3");
    svgEl.appendChild(l);
  });

  dot.setAttribute("r", "3");
  dot.setAttribute("fill", "yellow");
  dot.setAttribute("opacity", "0.8");
  dot.setAttribute("pointer-events", "none");
  svgEl.appendChild(dot);

  pinDot.setAttribute("r", "5");
  pinDot.setAttribute("fill", "none");
  pinDot.setAttribute("stroke", "#ff4444");
  pinDot.setAttribute("stroke-width", "1.5");
  pinDot.setAttribute("opacity", "0");
  pinDot.setAttribute("pointer-events", "none");
  svgEl.appendChild(pinDot);

  // ── Convert mouse position → SVG viewBox coordinates ──
  function toSVG(e) {
    const r  = svgEl.getBoundingClientRect();
    const sx = VB_W / r.width;
    const sy = VB_H / r.height;
    return {
      x: Math.round((e.clientX - r.left) * sx),
      y: Math.round((e.clientY - r.top)  * sy),
    };
  }

  // ── Mouse move: live readout + crosshairs ──
  svgEl.addEventListener("mousemove", function (e) {
    const { x, y } = toSVG(e);

    overlay.innerHTML = `<b>x:</b> ${x}<br><b>y:</b> ${y}`;

    hLine.setAttribute("x1", "0");
    hLine.setAttribute("y1", y);
    hLine.setAttribute("x2", VB_W);
    hLine.setAttribute("y2", y);

    vLine.setAttribute("x1", x);
    vLine.setAttribute("y1", "0");
    vLine.setAttribute("x2", x);
    vLine.setAttribute("y2", VB_H);

    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
  });

  // ── Click: pin the coordinate and log to console ──
  let pinned = null;
  svgEl.addEventListener("click", function (e) {
    const { x, y } = toSVG(e);
    pinned = { x, y };

    pinDot.setAttribute("cx", x);
    pinDot.setAttribute("cy", y);
    pinDot.setAttribute("opacity", "1");

    overlay.innerHTML =
      `<b>x:</b> ${x}<br><b>y:</b> ${y}<br>` +
      `<span style="color:#ff8;font-size:11px">📌 pinned — click again to update</span>`;

    console.log(`Pinned: [${x}, ${y}]`);
  });

  svgEl.addEventListener("mouseleave", function () {
    if (!pinned) overlay.innerHTML = "hover over map";
    hLine.setAttribute("x1", "0"); hLine.setAttribute("x2", "0");
    vLine.setAttribute("y1", "0"); vLine.setAttribute("y2", "0");
    dot.setAttribute("cx", "-99"); dot.setAttribute("cy", "-99");
  });

  console.log(
    "%c[debug_coords] active — hover over map for live coords, click to pin",
    "color:#4af; font-weight:bold"
  );
})();
