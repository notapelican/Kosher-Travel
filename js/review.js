// One report on its own page: review.html?id=123. Every card on the site
// links here.
import {
  supabase, isConfigured, renderHeader, renderSetupWarning, reviewCard, enablePhotoLightbox,
  notify, emptyState, currentProfile, $, esc
} from "./app.js";

const box = $("#report");
const more = $("#report-more");
const msg = $("#report-msg");
const id = Number(new URLSearchParams(location.search).get("id"));

renderHeader("");
enablePhotoLightbox(box);
wireBackLink();

if (!isConfigured) renderSetupWarning();
else if (!Number.isInteger(id) || id <= 0) notFound();
else load();

/** "Back" returns to the list you came from, filters and scroll position included. */
function wireBackLink() {
  const back = $("#back-link");
  let from = null;
  try { from = document.referrer && new URL(document.referrer); } catch {}
  if (!from || from.origin !== location.origin || from.pathname.endsWith("/review.html")) return;
  const page = from.pathname.split("/").pop() || "index.html";
  back.textContent = page === "mine.html" ? "← My ratings" : page === "admin.html" ? "← Admin" : "← Back to reports";
  back.addEventListener("click", (event) => {
    if (history.length > 1) { event.preventDefault(); history.back(); }
  });
}

async function load() {
  box.innerHTML = `<p class="hint">Loading…</p>`;
  let { data: report } = await supabase.from("reviews_public").select("*").eq("id", id).maybeSingle();
  let note = "";

  // Hidden reports are not in the public view; their author and admins can
  // still open them (row-level security decides).
  const profile = await currentProfile();
  if (profile) {
    const { data: own } = await supabase.from("reviews").select("*, review_meals(*)").eq("id", id).maybeSingle();
    if (own && !report) {
      report = own;
      note = own.is_hidden ? "Hidden from the public list" : "";
    }
    if (own) showActions(own);
  }
  if (!report) return notFound();

  document.title = `${[report.airline, report.flight_number].filter(Boolean).join(" ")} — Kosher Travel`;
  box.innerHTML = reviewCard(report, { full: true, bylineNote: note });

  const links = [];
  if (report.flight_number) links.push([`index.html?flight=${encodeURIComponent(report.flight_number)}`, `More on ${report.flight_number}`]);
  if (report.airline) links.push([`index.html?airline=${encodeURIComponent(report.airline)}`, `More ${report.airline} reports`]);
  const from = report.origin_iata || (report.origin_city || "").match(/\(([A-Z]{3})\)\s*$/)?.[1];
  const to = report.destination_iata || (report.destination_city || "").match(/\(([A-Z]{3})\)\s*$/)?.[1];
  if (from && to) links.push([`index.html?from=${from}&to=${to}`, `${from} → ${to}`]);
  if (report.flight_number) links.push([`submit.html?flight=${encodeURIComponent(report.flight_number)}`, "Flown it? Add yours"]);
  more.innerHTML = links.map(([href, label]) => `<a class="btn small" href="${esc(href)}">${esc(label)}</a>`).join("");
  more.hidden = !links.length;
}

function showActions(own) {
  const nav = $(".report-nav");
  if (nav.querySelector(".edit-link")) return;
  nav.insertAdjacentHTML("beforeend", `<a class="btn small edit-link" href="submit.html?edit=${esc(own.id)}">Edit</a>`);
}

function notFound() {
  box.innerHTML = emptyState("This report is not available",
    `<p>It may have been removed, or the link is incomplete. <a href="index.html">See all reports.</a></p>`);
  notify(msg, "");
}
