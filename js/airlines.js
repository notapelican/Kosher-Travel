import {
  supabase, isConfigured, renderHeader, renderSetupWarning, notify, stars, esc, airlineLogo, loadAirlines, $
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
  .join("") + `<option value="count">Number of ratings</option><option value="name">Name</option>`;

if (!isConfigured) {
  renderSetupWarning();
  body.innerHTML = `<tr><td colspan="5" class="empty">Connect a Supabase project to see airlines.</td></tr>`;
} else {
  load();
}

async function load() {
  const [known, { data, error }] = await Promise.all([
    loadAirlines(),
    supabase.from("reviews_public")
      .select(`airline, airline_iata, rating, ${EXPERIENCE_SCORES.map((s) => s.key).join(", ")}`)
      .limit(5000)
  ]);
  if (error) return notify(msg, `Could not load airlines: ${error.message}`, "error");

  // Start from every airline in the table, then add any name a review used that is not there.
  const byKey = new Map(known.map((a) => [a.iata, { iata: a.iata, name: a.name, logo: a.logo_url, count: 0, totals: {}, counts: {} }]));
  const byName = new Map([...byKey.values()].map((e) => [e.name.toLowerCase(), e]));
  for (const row of data || []) {
    const name = (row.airline || "").trim();
    let entry = (row.airline_iata && byKey.get(row.airline_iata)) || byName.get(name.toLowerCase());
    if (!entry) {
      if (!name) continue;
      entry = { iata: null, name, logo: null, count: 0, totals: {}, counts: {} };
      byName.set(name.toLowerCase(), entry);
    }
    entry.count += 1;
    for (const { key } of COLUMNS) {
      if (row[key] == null) continue;
      entry.totals[key] = (entry.totals[key] || 0) + Number(row[key]);
      entry.counts[key] = (entry.counts[key] || 0) + 1;
    }
  }

  airlines = [...new Set([...byKey.values(), ...byName.values()])].map((entry) => ({
    iata: entry.iata, name: entry.name, logo: entry.logo, count: entry.count,
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
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "count") return b.count - a.count || a.name.localeCompare(b.name);
      // Airlines with no score for the chosen column sink to the bottom, alphabetically.
      const av = a.averages[sortKey]?.avg ?? -1;
      const bv = b.averages[sortKey]?.avg ?? -1;
      return bv - av || b.count - a.count || a.name.localeCompare(b.name);
    });

  body.innerHTML = rows.length
    ? rows.map((a) => `<tr class="${a.count ? "" : "unrated"}">
        <td data-label="" class="airline-cell">
          <a href="index.html?airline=${encodeURIComponent(a.name)}">${airlineLogo(a.iata, a.name, a.logo)}<span>${esc(a.name)}${a.iata ? `<small>${esc(a.iata)}</small>` : ""}</span></a></td>
        <td data-label="Ratings">${a.count || `<span class="no-data">No reports yet</span>`}</td>
        ${COLUMNS.map(({ key, short }) => {
          const score = a.averages[key];
          return `<td class="score-cell" data-label="${esc(short)}">${score
            ? `${stars(score.avg, { fractional: true })} <small>${score.avg.toFixed(1)} from ${score.n}</small>`
            : `<span class="no-data">—</span>`}</td>`;
        }).join("")}
      </tr>`).join("")
    : `<tr><td colspan="${COLUMNS.length + 2}" class="empty">No airlines with that many ratings yet.</td></tr>`;
}

$("#airline-controls").addEventListener("input", draw);
$("#airline-controls").addEventListener("submit", (event) => event.preventDefault());
