import {
  supabase, isConfigured, renderHeader, renderSetupWarning, reviewCard,
  enablePhotoLightbox, notify, fillSelect, $
} from "./app.js";
import { EXPERIENCE_SCORES } from "./options.js";

const PAGE_SIZE = 20;

const list = $("#reviews");
const msg = $("#list-msg");
const moreBtn = $("#load-more");
const form = $("#filters");

let page = 0;
let loading = false;

renderHeader("index.html");
enablePhotoLightbox(list);

// Deep links from other pages, e.g. index.html?q=El%20Al
const params = new URLSearchParams(location.search);
if (params.get("q")) $("#f-q").value = params.get("q");

if (!isConfigured) {
  renderSetupWarning();
  list.innerHTML = `<div class="empty">Connect a Supabase project to see ratings.</div>`;
} else {
  loadFacets();
  // The confirmation goes up after the first page loads, which clears notices.
  reload().then(() => {
    if (params.get("posted")) notify(msg, "Thanks — your rating is live.", "ok");
  });
}

/* Filter values + headline numbers, from a single lightweight query. */
async function loadFacets() {
  const { data, error } = await supabase
    .from("reviews_public")
    .select("rating, airline, hechsher")
    .limit(5000);
  if (error || !data) return;

  const uniqueSorted = (key) =>
    [...new Set(data.map((r) => (r[key] || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

  fillSelect($("#f-airline"), uniqueSorted("airline"), "Any");
  fillSelect($("#f-hechsher"), uniqueSorted("hechsher"), "Any");

  if (data.length) {
    const avg = data.reduce((sum, r) => sum + Number(r.rating), 0) / data.length;
    $("#stat-count").textContent = data.length;
    $("#stat-avg").textContent = avg.toFixed(1);
    $("#stat-airlines").textContent = uniqueSorted("airline").length;
    $("#stats").hidden = false;
  }
}

function currentFilters() {
  return {
    q: $("#f-q").value.trim(),
    airline: $("#f-airline").value,
    hechsher: $("#f-hechsher").value,
    sort: $("#f-sort").value
  };
}

function buildQuery({ q, airline, hechsher, sort }, from, to) {
  let query = supabase.from("reviews_public").select("*");

  if (airline) query = query.eq("airline", airline);
  if (hechsher) query = query.eq("hechsher", hechsher);
  if (q) {
    // PostgREST `or` takes a comma-separated list, so strip commas from input.
    const term = `%${q.replace(/[,()]/g, " ")}%`;
    query = query.or(
      ["airline", "flight_number", "origin_city", "destination_city", "meal_name", "hechsher", "comment"]
        .map((col) => `${col}.ilike.${term}`)
        .join(",")
    );
  }

  const SORTS = {
    best:  { column: "rating", ascending: false },
    worst: { column: "rating", ascending: true },
    respect: { column: "respect_score", ascending: false },
    care:    { column: "kosher_care_score", ascending: false }
  };
  const chosen = SORTS[sort];
  if (chosen) {
    // nullsFirst false keeps unrated reviews out of the way when sorting by an
    // optional score.
    query = query
      .order(chosen.column, { ascending: chosen.ascending, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  return query.range(from, to);
}

async function reload() {
  page = 0;
  list.innerHTML = "";
  await loadPage();
}

async function loadPage() {
  if (loading) return;
  loading = true;
  moreBtn.disabled = true;
  notify(msg, "");

  const from = page * PAGE_SIZE;
  const { data, error } = await buildQuery(currentFilters(), from, from + PAGE_SIZE - 1);

  loading = false;
  moreBtn.disabled = false;

  if (error) {
    notify(msg, `Could not load ratings: ${error.message}`, "error");
    return;
  }

  list.insertAdjacentHTML("beforeend", data.map((r) => reviewCard(r)).join(""));
  page += 1;
  moreBtn.hidden = data.length < PAGE_SIZE;

  if (!list.children.length) {
    list.innerHTML = `<div class="empty">No ratings match that yet.
      <a href="submit.html">Be the first to add one.</a></div>`;
  }
}

let debounce;
form.addEventListener("input", (event) => {
  if (!isConfigured) return;
  clearTimeout(debounce);
  debounce = setTimeout(reload, event.target.type === "search" ? 300 : 0);
});
form.addEventListener("reset", () => {
  if (!isConfigured) return;
  setTimeout(reload, 0);
});
form.addEventListener("submit", (event) => event.preventDefault());
moreBtn.addEventListener("click", loadPage);
