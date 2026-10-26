import {
  supabase, isConfigured, renderHeader, renderSetupWarning, reviewCard, enableReviewLinks, clampReviews,
  notify, fillSelect, emptyState, airlineLogo, loadAirlines, lookupFlight, parseFlightNumber,
  currentDesign, photoUrl, reviewHref, formatDate, timeAgo, stars, esc, LOGO, $, $$
} from "./app.js";
import { EXPERIENCE_SCORES, DIETS, dietIcon } from "./options.js";
import { airportPicker } from "./airports.js";

const PAGE_SIZE = 18;

const list = $("#reviews");
const msg = $("#list-msg");
const moreBtn = $("#load-more");
const form = $("#filters");
const countEl = $("#result-count");
const missEl = $("#miss");

let page = 0;
let loading = false;
let sort = "new";
let total = 0;
let routeRows = [];      // reviews for the route block, aggregated per airline on render
let firstPage = [];      // the latest page, for the night skin's featured panel

renderHeader("index.html");
enableReviewLinks(list);
readUrl();
// suggest airports, but any text still searches (a city name matches all its airports)
for (const id of ["#f-from", "#f-to"]) airportPicker($(id), { fill: "code" });

if (!isConfigured) {
  renderSetupWarning();
  list.innerHTML = emptyState("Not connected", "Add your Supabase project details to see ratings.");
} else {
  Promise.all([loadFacets(), reload()]).then(() => {
    if (new URLSearchParams(location.search).get("posted")) notify(msg, "Thanks — your rating is live.", "ok");
  });
}

/* ------------------------------------------------------------------ filters */

function readUrl() {
  renderDietChips();
  const p = new URLSearchParams(location.search);
  for (const key of ["from", "to", "flight"]) if (p.get(key)) $(`#f-${key}`).value = p.get(key);
  if (p.get("airline")) $("#f-airline").dataset.pending = p.get("airline");
  if (p.get("hechsher")) $("#f-hechsher").dataset.pending = p.get("hechsher");
  if (p.get("q")) $("#f-airline").dataset.pending = p.get("q");     // old deep links
  if (p.get("sort")) setSort(p.get("sort"), false);
  const diets = (p.get("diet") || "").split(",");
  for (const box of $$("#f-diet-chips input")) box.checked = diets.includes(box.value);
  labelDietButton();
}

function filters() {
  return {
    from: $("#f-from").value.trim(),
    to: $("#f-to").value.trim(),
    flight: parseFlightNumber($("#f-flight").value),
    flightRaw: $("#f-flight").value.trim(),
    airline: $("#f-airline").value,
    hechsher: $("#f-hechsher").value,
    diets: $$("#f-diet-chips input:checked").map((box) => box.value),
    sort
  };
}

function setSort(value, rerun = true) {
  sort = value;
  for (const b of $$("#sort button")) b.setAttribute("aria-pressed", String(b.dataset.sort === value));
  if (rerun) reload();
}

/* A place filter matches either the free-text city or the airport code. */
function placeClause(col, value) {
  const safe = value.replace(/[,()*]/g, " ").trim();
  const code = safe.toUpperCase();
  const parts = [`${col}_city.ilike.*${safe}*`];
  if (/^[A-Z]{3}$/.test(code)) parts.push(`${col}_iata.eq.${code}`);
  return parts.join(",");
}

function applyFilters(query, f) {
  if (f.from) query = query.or(placeClause("origin", f.from));
  if (f.to) query = query.or(placeClause("destination", f.to));
  if (f.airline) query = query.eq("airline", f.airline);
  if (f.hechsher) query = query.contains("hechshers", [f.hechsher]);   // any meal on the report
  // some meal on the report is marked as every diet picked (jsonb containment on the meals list)
  if (f.diets?.length) query = query.filter("meals", "cs", JSON.stringify([{ diets: f.diets }]));
  if (f.flight) query = query.ilike("flight_number", `%${f.flight.iata}%${f.flight.number}%`);
  else if (f.flightRaw) query = query.ilike("flight_number", `%${f.flightRaw.replace(/[%_]/g, "")}%`);
  return query;
}

/** The ilike above is loose ("LY 26" also matches "LY 260"); tighten in JS. */
function exactFlight(rows, f) {
  if (!f.flight) return rows;
  const want = f.flight.iata + f.flight.number;
  return rows.filter((r) => {
    const p = parseFlightNumber(r.flight_number);
    return p && p.iata + p.number === want;
  });
}

function buildQuery(f, from, to) {
  let query = supabase.from("reviews_public").select("*", { count: "exact" });
  query = applyFilters(query, f);
  const SORTS = {
    best: ["rating", false], worst: ["rating", true],
    respect: ["respect_score", false], care: ["kosher_care_score", false]
  };
  if (SORTS[f.sort]) {
    const [column, ascending] = SORTS[f.sort];
    query = query.order(column, { ascending, nullsFirst: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  return query.range(from, to);
}

/* ------------------------------------------------------------- facets, hero */

async function loadFacets() {
  const [{ data }, airlines] = await Promise.all([
    supabase.from("reviews_public")
      .select("rating, airline, hechshers, origin_city, destination_city, origin_iata, destination_iata, created_at")
      .order("created_at", { ascending: false }).limit(5000),
    loadAirlines()
  ]);
  const rows = data || [];
  const inReviews = new Set(rows.map((r) => (r.airline || "").trim()).filter(Boolean));
  const names = [...new Set([...airlines.map((a) => a.name), ...inReviews])].sort((a, b) => a.localeCompare(b));
  fillSelect($("#f-airline"), names, "Any airline");
  const hechsherim = [...new Set(rows.flatMap((r) => r.hechshers || []).map((h) => h.trim()).filter(Boolean))].sort();
  fillSelect($("#f-hechsher"), hechsherim, "Any hechsher");
  for (const sel of [$("#f-airline"), $("#f-hechsher")]) {
    if (sel.dataset.pending && [...sel.options].some((o) => o.value === sel.dataset.pending)) sel.value = sel.dataset.pending;
    delete sel.dataset.pending;
  }

  if (rows.length) {
    const routes = new Set(rows.map((r) => `${r.origin_iata || r.origin_city}→${r.destination_iata || r.destination_city}`));
    $("#hero-tick").innerHTML =
      `<span><b>${rows.length}</b> report${rows.length === 1 ? "" : "s"}</span>` +
      `<span><b>${routes.size}</b> route${routes.size === 1 ? "" : "s"}</span>` +
      `<span><b>${inReviews.size}</b> airline${inReviews.size === 1 ? "" : "s"}</span>` +
      `<span>updated <b>${esc(timeAgo(rows[0].created_at))}</b></span>`;
    $("#hero-tick").hidden = false;
  }
  // facets may have arrived after the first page: re-run once if a pending value changed the filter
  if ($("#f-airline").value || $("#f-hechsher").value) reload();
}

function renderFeatured() {
  const box = $("#hero-light");
  if (!box) return;
  const pick = firstPage.find((r) => r.photos?.length);
  if (!pick) {
    box.innerHTML = `<div class="empty-light">${LOGO}</div>`;
    return;
  }
  const route = [pick.origin_iata || pick.origin_city, pick.destination_iata || pick.destination_city].filter(Boolean).join(" → ");
  // the same report is in the list below, so this mouse-only link stays out of the tab order
  box.innerHTML = `<a class="feature" href="${esc(reviewHref(pick))}" tabindex="-1">
    <img src="${esc(photoUrl(pick.photos[0]))}" alt="">
    <div class="cap"><div class="sc">${esc(Number(pick.rating).toFixed(Number.isInteger(Number(pick.rating)) ? 0 : 1))}</div>
      <b>${esc([pick.airline, pick.flight_number].filter(Boolean).join(" "))}${route ? ` · ${esc(route)}` : ""}</b>
      <span>${esc([pick.hechsher, pick.origin_city ? `loaded ${pick.origin_city}` : "", pick.meal_name, formatDate(pick.created_at)].filter(Boolean).join(" · "))}</span></div></a>`;
}

/* --------------------------------------------------------- route airlines */

async function loadRouteBlock(f) {
  let query = supabase.from("reviews_public")
    .select(`airline, airline_iata, airline_logo_url, flight_number, origin_city, origin_iata, hechsher, rating, created_at, author_name, is_anonymous, ${EXPERIENCE_SCORES.map((s) => s.key).join(", ")}`)
    .order("created_at", { ascending: false }).limit(5000);
  // the block describes the route and seal, not one flight or one airline
  query = applyFilters(query, { ...f, flight: null, flightRaw: "", airline: "" });
  const { data } = await query;
  routeRows = data || [];
  renderRouteBlock(f);
}

function mode(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function aggregate(rows) {
  const by = new Map();
  for (const r of rows) {
    const name = (r.airline || "").trim(); if (!name) continue;
    if (!by.has(name)) by.set(name, { name, iata: r.airline_iata, logo: r.airline_logo_url, rows: [] });
    const e = by.get(name); e.rows.push(r); e.iata ||= r.airline_iata; e.logo ||= r.airline_logo_url;
  }
  const avg = (rows, key) => { const v = rows.map((r) => r[key]).filter((x) => x != null).map(Number); return v.length ? { avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length } : null; };
  return [...by.values()].map((e) => ({
    ...e, count: e.rows.length,
    meal: avg(e.rows, "rating"), respect: avg(e.rows, "respect_score"), care: avg(e.rows, "kosher_care_score"),
    flight: mode(e.rows.map((r) => r.flight_number)), loaded: mode(e.rows.map((r) => r.origin_city)),
    seal: mode(e.rows.map((r) => r.hechsher)), last: e.rows[0]
  })).sort((a, b) => (b.meal?.avg ?? 0) - (a.meal?.avg ?? 0) || b.count - a.count);
}

function routeLabel(f) {
  const from = f.from.toUpperCase(), to = f.to.toUpperCase();
  if (from && to) return `${from} → ${to}`;
  if (from) return `from ${from}`;
  if (to) return `to ${to}`;
  return "";
}

function renderRouteBlock(f) {
  const block = $("#route-block");
  const label = routeLabel(f);
  let airlines = aggregate(routeRows);
  if (!label) airlines = airlines.sort((a, b) => b.count - a.count).slice(0, 8);
  if (!airlines.length) { block.hidden = true; return; }
  block.hidden = false;
  $("#route-heading").innerHTML = label
    ? `Airlines on ${esc(label)}`
    : `Airlines <small><a href="airlines.html">All airlines →</a></small>`;
  const which = currentDesign().airlines;
  $("#route-airlines").innerHTML = which === "table" ? routeTable(airlines)
    : which === "tiles" ? routeTiles(airlines) : routeBars(airlines);
}

const pct = (s) => (s ? `${Math.round((s.avg / 5) * 100)}%` : "0%");
const link = (a) => `index.html?airline=${encodeURIComponent(a.name)}`;
const dots = (s, l) => s
  ? `<span class="dots" data-l="${l}">${[1, 2, 3, 4, 5].map((n) => `<b class="${n <= Math.round(s.avg) ? "on" : ""}"></b>`).join("")}</span>`
  : `<span class="dots na" data-l="${l}">not enough reports</span>`;
const flap = (s) => s ? `<span class="flap score">${s.avg.toFixed(1).split("").map((c) => `<i>${c}</i>`).join("")}</span>` : `<span class="dots na">—</span>`;

function routeTable(airlines) {
  return `<div class="route-table">
    <div class="head"><span>Airline</span><span>Flight</span><span>Loaded in</span><span>Seal</span><span>Meal</span><span>Respect</span><span>Kosher care</span><span>Last report</span></div>
    ${airlines.map((a) => `<a class="r" href="${link(a)}">
      <div class="al">${airlineLogo(a.iata, a.name, a.logo)}<span>${esc(a.name)}<small>${a.count} report${a.count === 1 ? "" : "s"}</small></span></div>
      <div class="flt">${esc(a.flight || "—")}</div>
      <div class="loaded">${esc(a.loaded || "—")}</div>
      <div class="seal">${esc(a.seal || "—")}</div>
      ${flap(a.meal)}
      <div class="dd">${dots(a.respect, "Respect")}${dots(a.care, "Care")}</div>
      <div class="last">${esc(timeAgo(a.last.created_at))} <em>· ${esc(a.last.is_anonymous ? "Anonymous" : a.last.author_name)}</em></div>
    </a>`).join("")}
  </div>`;
}
function routeTiles(airlines) {
  return `<div class="route-tiles">${airlines.map((a) => `<a class="t" href="${link(a)}">
    ${airlineLogo(a.iata, a.name, a.logo)}
    <div class="name"><b>${esc(a.name)}</b><span>${a.count} report${a.count === 1 ? "" : "s"}${a.seal ? ` · ${esc(a.seal)}` : ""}${a.loaded ? ` · loaded ${esc(a.loaded)}` : ""}</span></div>
    <div class="sc">${a.meal ? a.meal.avg.toFixed(1) : "—"}</div>
    <div class="bars"><span>Respect</span><i><b style="width:${pct(a.respect)}"></b></i><span>Care</span><i><b style="width:${pct(a.care)}"></b></i></div>
  </a>`).join("")}</div>`;
}
function routeBars(airlines) {
  return `<div class="route-bars">${airlines.map((a) => `<a class="r" href="${link(a)}">
    ${airlineLogo(a.iata, a.name, a.logo)}
    <div class="name"><b>${esc(a.name)}</b> <span>· ${a.count} report${a.count === 1 ? "" : "s"}${a.seal ? ` · ${esc(a.seal)}` : ""}${a.loaded ? ` · loaded ${esc(a.loaded)}` : ""}</span></div>
    <div class="sc">${a.meal ? a.meal.avg.toFixed(1) : "—"}<small>/5</small></div>
    <div class="bars"><span>Respect</span><i><b style="width:${pct(a.respect)}"></b></i><span>Kosher care</span><i><b style="width:${pct(a.care)}"></b></i></div>
  </a>`).join("")}</div>`;
}

/* ----------------------------------------------------------------- results */

async function reload() {
  page = 0;
  list.innerHTML = "";
  missEl.hidden = true;
  const f = filters();
  await Promise.all([loadPage(f), loadRouteBlock(f)]);
  // the count names how many airlines the route block found, so redraw it once both are in
  if (!countEl.hidden) renderCount(f);
}

/**
 * Reports with photos are shown first, without changing what a sort means:
 * on Newest, each loaded batch lists its photo reports first; on the score
 * sorts, photo reports come first among reports with the same score.
 */
const SORT_COLUMN = { best: "rating", worst: "rating", respect: "respect_score", care: "kosher_care_score" };
function preferPhotos(rows, sortKey) {
  const column = SORT_COLUMN[sortKey];
  // rows arrive sorted, so equal scores are next to each other: number the runs
  let group = 0;
  const keyed = rows.map((r, i) => {
    if (column && i > 0 && Number(r[column] ?? -1) !== Number(rows[i - 1][column] ?? -1)) group += 1;
    return { r, i, group, bare: r.photos?.length ? 0 : 1 };
  });
  return keyed.sort((a, b) => a.group - b.group || a.bare - b.bare || a.i - b.i).map(({ r }) => r);
}

async function loadPage(f = filters()) {
  if (loading) return;
  loading = true;
  moreBtn.disabled = true;
  notify(msg, "");

  const from = page * PAGE_SIZE;
  const { data, error, count } = await buildQuery(f, from, from + PAGE_SIZE - 1);
  loading = false;
  moreBtn.disabled = false;
  if (error) return notify(msg, `Could not load ratings: ${error.message}`, "error");

  const rows = preferPhotos(exactFlight(data || [], f), f.sort);
  if (page === 0) { total = f.flight ? rows.length : (count ?? rows.length); firstPage = rows; renderFeatured(); }
  list.insertAdjacentHTML("beforeend", rows.map((r) => reviewCard(r)).join(""));
  clampReviews(list);
  page += 1;
  moreBtn.hidden = (data || []).length < PAGE_SIZE;
  renderCount(f);

  if (!list.children.length) {
    list.innerHTML = "";
    await renderMiss(f);
  }
}

function renderCount(f) {
  const bits = [];
  const label = routeLabel(f);
  if (label) bits.push(`on ${esc(label)}`);
  bits.push(f.flight ? esc(f.flight.display) : "any flight");
  bits.push(f.airline ? esc(f.airline) : `${aggregate(routeRows).length || "all"} airline${aggregate(routeRows).length === 1 ? "" : "s"}`);
  bits.push(f.hechsher ? esc(f.hechsher) : "any hechsher");
  if (f.diets.length) bits.push(esc(f.diets.map((key) => DIETS.find((d) => d.key === key)?.label || key).join(" + ").toLowerCase()));
  countEl.innerHTML = `<b>${total} report${total === 1 ? "" : "s"}</b> ${bits.join(" · ")}`;
  countEl.hidden = false;
}

/** Nothing matched. If a flight was asked for, find out whether it exists. */
async function renderMiss(f) {
  const add = (flight) => `<a class="btn btn-primary" href="submit.html${flight ? `?flight=${encodeURIComponent(flight)}` : ""}">Add yours</a>`;
  if (!f.flight) {
    list.innerHTML = emptyState("Nothing here yet", `No ratings match that. <a href="submit.html">Add the first one.</a>`);
    return;
  }
  missEl.hidden = false;
  missEl.className = "miss";
  missEl.innerHTML = `<div><b>Checking ${esc(f.flight.display)}…</b></div>`;
  const result = await lookupFlight(f.flight.display);
  if (result.found) {
    const fl = result.flight;
    const route = [fl.origin_iata, fl.destination_iata].filter(Boolean).join(" → ");
    missEl.innerHTML = `<div><b>No reports for ${esc(f.flight.display)} yet.</b>
      <span class="hint">${esc([route, fl.aircraft].filter(Boolean).join(" · ") || "The flight exists")}. Flown it? Tell the next traveler what was on the tray.</span></div>${add(f.flight.display)}`;
  } else if (result.unavailable) {
    missEl.innerHTML = `<div><b>No reports for ${esc(f.flight.display)} yet.</b><span class="hint">Flown it? Add yours.</span></div>${add(f.flight.display)}`;
  } else {
    missEl.className = "notice error";
    missEl.textContent = result.reason || `${f.flight.display} does not seem to be a current flight. Check the number.`;
  }
}

/* -------------------------------------------------------------- diet filter */

// The diet picker is a button that opens the same icon chips the rating form
// uses. Ticking a chip searches straight away, like the other filters.
function renderDietChips() {
  $("#f-diet-chips").innerHTML = DIETS.map((d) => `
    <label class="diet-chip"><input type="checkbox" value="${d.key}" class="sr-only">${dietIcon(d.key)}<span>${esc(d.label)}</span></label>`).join("");
}

function labelDietButton() {
  const picked = DIETS.filter((d) => $(`#f-diet-chips input[value="${d.key}"]`)?.checked);
  const button = $("#f-diet");
  button.innerHTML = picked.length
    ? `${dietIcon(picked[0].key, { size: 16 })}<span>${esc(picked[0].label)}${picked.length > 1 ? ` +${picked.length - 1}` : ""}</span>`
    : `<span>Any diet</span>`;
  button.classList.toggle("is-set", picked.length > 0);
}

function openDietPop(open) {
  const pop = $("#f-diet-pop");
  pop.hidden = !open;
  $("#f-diet").setAttribute("aria-expanded", String(open));
  if (!open) return;
  pop.classList.remove("flip");
  if (pop.getBoundingClientRect().right > document.documentElement.clientWidth - 8) pop.classList.add("flip");
  pop.querySelector("input")?.focus();
}
$("#f-diet").addEventListener("click", () => openDietPop($("#f-diet-pop").hidden));
$("#f-diet-done").addEventListener("click", () => { openDietPop(false); $("#f-diet").focus(); });
$("#f-diet-clear").addEventListener("click", () => {
  for (const box of $$("#f-diet-chips input")) box.checked = false;
  labelDietButton();
  form.dispatchEvent(new Event("input"));
});
$("#f-diet-chips").addEventListener("change", labelDietButton);
document.addEventListener("click", (event) => {
  if (!$("#f-diet-pop").hidden && !event.target.closest(".diet-field")) openDietPop(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#f-diet-pop").hidden) { openDietPop(false); $("#f-diet").focus(); }
});

/* ------------------------------------------------------------------ events */

let debounce;
form.addEventListener("input", (event) => {
  if (!isConfigured) return;
  clearTimeout(debounce);
  debounce = setTimeout(reload, event.target.tagName === "INPUT" ? 350 : 0);
});
form.addEventListener("submit", (event) => { event.preventDefault(); clearTimeout(debounce); reload(); });
$("#sort").addEventListener("click", (event) => {
  const b = event.target.closest("[data-sort]");
  if (b) setSort(b.dataset.sort);
});
moreBtn.addEventListener("click", () => loadPage());
document.addEventListener("design-change", () => { renderRouteBlock(filters()); renderFeatured(); });
