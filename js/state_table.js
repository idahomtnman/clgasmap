/* state_table.js — Collapsible, sortable state gas price table */

const STATE_NAMES_TABLE = {
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

// Column definitions
// sortable: true → clickable header; defaultDesc: true → first click sorts high→low
const COLS = [
  { key:"rank",      label:"Rank",        sortable:true,  defaultDesc:false, num:true  },
  { key:"name",      label:"State",       sortable:true,  defaultDesc:false, num:false },
  { key:"regular",   label:"Regular",     sortable:true,  defaultDesc:true,  num:true  },
  { key:"mid_grade", label:"Mid-Grade",   sortable:false, num:true  },
  { key:"premium",   label:"Premium",     sortable:false, num:true  },
  { key:"diesel",    label:"Diesel",      sortable:true,  defaultDesc:true,  num:true  },
  { key:"pct",       label:"vs Nat'l Avg",sortable:false, num:true  },
];

function fmt(row, key) {
  const v = row[key];
  if (v == null) return "—";
  switch (key) {
    case "rank":      return `#${v}`;
    case "name":      return v;
    case "pct":       return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
    default:          return `$${v.toFixed(3)}`;
  }
}

function initStateTable(gasData) {
  const toggleBtn = document.getElementById("state-table-toggle");
  const wrap      = document.getElementById("state-table-wrap");
  const container = document.getElementById("state-table-container");
  if (!toggleBtn || !wrap || !container || !gasData?.states) return;

  const states     = gasData.states;
  const natAvg     = gasData.national_avg;

  // Build rank map once (1 = most expensive regular)
  const ranked = Object.entries(states)
    .filter(([, v]) => v?.regular != null)
    .sort(([, a], [, b]) => b.regular - a.regular);
  const rankMap    = Object.fromEntries(ranked.map(([code], i) => [code, i + 1]));
  const totalRanked = ranked.length;

  // Flatten into row objects
  const allRows = Object.entries(states).map(([code, data]) => ({
    code,
    name:      STATE_NAMES_TABLE[code] || code,
    regular:   data?.regular   ?? null,
    mid_grade: data?.mid_grade ?? null,
    premium:   data?.premium   ?? null,
    diesel:    data?.diesel    ?? null,
    rank:      rankMap[code]   ?? null,
    pct:       (data?.regular != null && natAvg)
               ? +((data.regular - natAvg) / natAvg * 100).toFixed(1)
               : null,
  }));

  // Sort state
  let sortCol = "rank";
  let sortAsc = true;   // rank 1 at top initially

  function sorted() {
    const dir = sortAsc ? 1 : -1;
    return [...allRows].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // nulls always last
      if (bv == null) return -1;
      if (typeof av === "string") return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });
  }

  function render() {
    const rows = sorted();

    // Table header
    let html = `<div class="state-table-scroll">
      <table class="state-price-table" aria-label="Gas prices by state">
        <thead><tr>`;

    for (const col of COLS) {
      if (col.sortable) {
        const active    = sortCol === col.key;
        const ariaSort  = active ? (sortAsc ? "ascending" : "descending") : "none";
        const arrow     = active ? (sortAsc ? "▲" : "▼") : "⇅";
        const cls       = ["spt-th-sort", active ? "spt-th-active" : ""].filter(Boolean).join(" ");
        html += `<th class="${cls}" data-col="${col.key}"
                     role="columnheader" aria-sort="${ariaSort}"
                     tabindex="0">${col.label} <span class="spt-sort-arrow" aria-hidden="true">${arrow}</span></th>`;
      } else {
        html += `<th>${col.label}</th>`;
      }
    }
    html += `</tr></thead><tbody>`;

    // Rows
    for (const row of rows) {
      html += "<tr>";
      for (const col of COLS) {
        let cls = col.num ? "spt-num" : "";
        if (col.key === "rank") {
          if (row.rank != null && row.rank <= 5)                cls += " spt-rank-high";
          else if (row.rank != null && row.rank >= totalRanked - 4) cls += " spt-rank-low";
        }
        if (col.key === "pct" && row.pct != null) {
          if (row.pct >  0.5) cls += " spt-pct-high";
          if (row.pct < -0.5) cls += " spt-pct-low";
        }
        html += `<td class="${cls.trim()}">${fmt(row, col.key)}</td>`;
      }
      html += "</tr>";
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    // Bind sort clicks / keyboard
    container.querySelectorAll("th[data-col]").forEach(th => {
      const handler = () => handleSort(th.dataset.col);
      th.addEventListener("click", handler);
      th.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
      });
    });
  }

  function handleSort(col) {
    const colDef = COLS.find(c => c.key === col);
    if (sortCol === col) {
      sortAsc = !sortAsc;   // toggle direction
    } else {
      sortCol = col;
      sortAsc = !colDef.defaultDesc;  // use column's preferred default
    }
    render();
  }

  // ── Collapse toggle ──
  toggleBtn.addEventListener("click", () => {
    const expanding = !wrap.classList.contains("expanded");
    wrap.classList.toggle("expanded", expanding);
    toggleBtn.setAttribute("aria-expanded", expanding);
    toggleBtn.classList.toggle("open", expanding);
  });

  render();
}
