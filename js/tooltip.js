/* tooltip.js — shared hover tooltip utility */

(function () {
  const el = document.getElementById("tooltip");
  const OFFSET_X = 14;
  const OFFSET_Y = -10;
  const EDGE_PAD = 12;

  function showTooltip(html, event) {
    el.innerHTML = html;
    el.classList.add("visible");
    el.removeAttribute("aria-hidden");
    positionTooltip(event);
  }

  function moveTooltip(event) {
    if (el.classList.contains("visible")) positionTooltip(event);
  }

  function hideTooltip() {
    el.classList.remove("visible");
    el.setAttribute("aria-hidden", "true");
  }

  function positionTooltip(event) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;

    let x = event.clientX + OFFSET_X;
    let y = event.clientY + OFFSET_Y;

    // Keep within viewport
    if (x + tw + EDGE_PAD > vw) x = event.clientX - tw - OFFSET_X;
    if (y + th + EDGE_PAD > vh) y = vh - th - EDGE_PAD;
    if (y < EDGE_PAD) y = EDGE_PAD;
    if (x < EDGE_PAD) x = EDGE_PAD;

    el.style.left = x + "px";
    el.style.top  = y + "px";
  }

  // Expose globally
  window.showTooltip = showTooltip;
  window.moveTooltip = moveTooltip;
  window.hideTooltip = hideTooltip;
})();
