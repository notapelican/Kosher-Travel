import {
  supabase, isConfigured, renderHeader, renderSetupWarning, notify, stars, esc, $
} from "./app.js";
import { EXPERIENCE_SCORES } from "./options.js";

// The meal score plus the two optional experience scores, in table order.
const COLUMNS = [
  { key: "rating", label: "Meal", short: "Meal" },
  ...EXPERIENCE_SCORES.map(({ key, label, short }) => ({ key, label, short }))
];

const body = $("#airline-body");
const msg = $("#list-msg");
let airlines = [];

renderHeader("airlines.html");

$("#airline-head").innerHTML =
  `<th>Airline</th><th>Ratings</th>` +
  COLUMNS.map((c) => `<th title="${esc(c.label)}">${esc(c.short)}</th>`).join("");

$("#sort-by").innerHTML = COLUMNS
  .map((c) => `<option value="${c.key}">${esc(c.label)} score</option>`)
  .join("") + `<option value="count">Number of ratings</option>`;

if (!isConfigured) {
  renderSetupWarning();
  body.innerHTML = `<tr><td colspan="5" class="empty">Connect a Supabase project to see airlines.</td></tr>`;
} else {
  load();
}

async function load() {
  const { data, error } = await supabase
    .from("reviews_public")
    .select(`airline, rating, ${EXPERIENCE_SCORES.map((s) => s.key).join(", ")}`)
    .limit(5000);

  if (error) return notify(msg, `Could not load airlines: ${error.message}`, "error");

  const grouped = new Map();
  for (const row of data) {
    const name = (row.airline || "").trim();
    if (!name) continue;
    if (!grouped.has(name)) grouped.set(name, { airline: name, count: 0, totals: {}, counts: {} });
    const entry = grouped.get(name);
    entry.count += 1;
    for (const { key } of COLUMNS) {
      if (row[key] == null) continue;
      entry.totals[key] = (entry.totals[key] || 0) + Number(row[key]);
      entry.counts[key] = (entry.counts[key] || 0) + 1;
    }
  }

  airlines = [...grouped.values()].map((entry) => ({
    airline: entry.airline,
    count: entry.count,
    averages: Object.fromEntries(COLUMNS.map(({ key }) => [
      key,
      entry.counts[key] ? { avg: entry.totals[key] / entry.counts[key], n: entry.counts[key] } : null
    ]))
  }));

  draw();
}

function draw() {
  const sortKey = $("#sort-by").value;
  const min = Number($("#min-reports").value);

  const rows = airlines
    .filter((a) => a.count >= min)
    .sort((a, b) => {
      if (sortKey === "count") return b.count - a.count;
      // Airlines with no score for the chosen column sink to the bottom.
      const av = a.averages[sortKey]?.avg ?? -1;
      const bv = b.averages[sortKey]?.avg ?? -1;
      return bv - av || b.count - a.count || a.airline.localeCompare(b.airline);
    });

  body.innerHTML = rows.length
    ? rows.map((a) => `<tr>
        <td data-label=""><a href="index.html?q=${encodeURIComponent(a.airline)}">${esc(a.airline)}</a></td>
        <td data-label="Ratings">${a.count}</td>
        ${COLUMNS.map(({ key, short }) => {
          const score = a.averages[key];
          return `<td class="score-cell" data-label="${esc(short)}">${score
            ? `${stars(score.avg, { fractional: true })} <small>${score.avg.toFixed(1)} from ${score.n}</small>`
            : `<span class="no-data">—</span>`}</td>`;
        }).join("")}
      </tr>`).join("")
    : `<tr><td colspan="${COLUMNS.length + 2}" class="empty">
         No airlines with that many ratings yet.</td></tr>`;
}

$("#airline-controls").addEventListener("input", draw);
$("#airline-controls").addEventListener("submit", (event) => event.preventDefault());
