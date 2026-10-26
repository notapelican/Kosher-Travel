import {
  supabase, isConfigured, renderHeader, renderSetupWarning, openAuthDialog, notify, fillDatalist,
  fillSelect, photoUrl, PHOTO_BUCKET, stars, loadAirlines, lookupFlight, parseFlightNumber, $, $$, esc
} from "./app.js";
import { AIRLINES, HECHSHERIM, MEAL_TYPES, CABIN_CLASSES, EXPERIENCE_SCORES } from "./options.js";

const form = $("#review-form");
const gate = $("#signin-gate");
const msg = $("#form-msg");
const thumbs = $("#thumbs");
const MAX_PHOTOS = 4;
const MAX_EDGE = 1600;      // px, longest side after client-side resize
const JPEG_QUALITY = 0.82;

/** { file?: File, path?: string, url: string } — path set once uploaded/pre-existing. */
let attachments = [];
let editingId = null;
let profile = null;
let airlines = [];                 // from the airlines table
let flight = { id: null, state: "none" };   // state: none | checking | ok | invalid | unknown

$("#experience-fields").innerHTML = EXPERIENCE_SCORES.map(({ key, label, help, scale }) => `
  <div class="field">
    <label for="${key}">${esc(label)} <span class="hint">optional</span></label>
    <select id="${key}">
      <option value="">Rather not say</option>
      ${[5, 4, 3, 2, 1].map((n) =>
        `<option value="${n}">${"★".repeat(n)} — ${esc(scale[n])}</option>`).join("")}
    </select>
    <span class="hint">${esc(help)}</span>
  </div>`).join("");

fillDatalist("airlines", AIRLINES);
fillDatalist("hechsherim", HECHSHERIM);
loadAirlines().then((rows) => {
  airlines = rows;
  if (rows.length) fillDatalist("airlines", [...new Set([...rows.map((a) => a.name), ...AIRLINES])].sort((a, b) => a.localeCompare(b)));
});
fillSelect($("#cabin_class"), CABIN_CLASSES, "Not sure");
fillSelect($("#meal_type"), MEAL_TYPES, "Not sure");

init();

async function init() {
  profile = await renderHeader("submit.html");
  if (!isConfigured) return renderSetupWarning();

  if (!profile) {
    gate.hidden = false;
    $("#gate-signin").addEventListener("click", () => openAuthDialog());
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") window.location.reload();
    });
    return;
  }

  if (profile.is_banned) {
    gate.hidden = false;
    gate.innerHTML = `<h2 style="margin-top:0">Posting disabled</h2>
      <p style="color:var(--muted)">This account can no longer post ratings.
      Email us if you think that is a mistake.</p>`;
    return;
  }

  form.hidden = false;
  wireBylineChoice();
  wireAccordions();
  wireFlightCheck();

  const params = new URLSearchParams(location.search);
  if (params.get("edit")) await loadForEdit(params.get("edit"));
  else if (params.get("flight")) {
    $("#flight_number").value = params.get("flight").toUpperCase();
    await checkFlight();
  }
}

/* ------------------------------------------------------------ flight check */

function airlineByName(name) {
  const n = (name || "").trim().toLowerCase();
  return airlines.find((a) => a.name.toLowerCase() === n) || null;
}
function airlineByIata(iata) {
  return airlines.find((a) => a.iata === iata) || null;
}

/**
 * Validates the flight number against the flight-lookup function as soon as
 * the field is left, fills in what it can (airline, route), and blocks posting
 * to a flight that does not exist. If the function is not deployed the check
 * is skipped and the form behaves as before.
 */
function wireFlightCheck() {
  const field = $("#flight_number");
  let timer;
  field.addEventListener("input", () => { flight = { id: null, state: "none" }; setFlightStatus(""); clearTimeout(timer); timer = setTimeout(checkFlight, 700); });
  field.addEventListener("blur", () => { clearTimeout(timer); checkFlight(); });
  $("#airline").addEventListener("change", () => { if (parseFlightNumber(field.value)) checkFlight(); });
}

function setFlightStatus(text, kind = "") {
  const el = $("#flight-status");
  el.textContent = text;
  el.style.color = kind === "error" ? "var(--danger)" : kind === "ok" ? "var(--good)" : "";
}

async function checkFlight() {
  const raw = $("#flight_number").value.trim();
  const parsed = parseFlightNumber(raw);
  if (!raw) { flight = { id: null, state: "none" }; setFlightStatus(""); return; }
  if (!parsed) { flight = { id: null, state: "invalid" }; setFlightStatus("Flight numbers look like LY 26: a two-character airline code and up to four digits.", "error"); return; }
  $("#flight_number").value = parsed.display;
  // the airline code in the number names the airline
  const byCode = airlineByIata(parsed.iata);
  if (byCode && !$("#airline").value.trim()) $("#airline").value = byCode.name;

  flight = { id: null, state: "checking" };
  setFlightStatus("Checking the flight…");
  const result = await lookupFlight(parsed.display);
  if (parseFlightNumber($("#flight_number").value)?.display !== parsed.display) return;   // field changed meanwhile
  if (result.found) {
    const f = result.flight;
    flight = { id: f.id, state: "ok", data: f };
    const route = [f.origin_iata, f.destination_iata].filter(Boolean).join(" → ");
    setFlightStatus(["Found", route, f.aircraft, f.codeshare ? "codeshare" : ""].filter(Boolean).join(" · "), "ok");
    if (!$("#origin_city").value.trim() && f.origin_iata) $("#origin_city").placeholder = `${f.origin_iata}, or the city it was actually loaded in`;
    if (!$("#destination_city").value.trim() && f.destination_iata) $("#destination_city").value = f.destination_iata;
  } else if (result.unavailable) {
    flight = { id: null, state: "unknown" };
    setFlightStatus("Could not verify this flight right now; you can still post.");
  } else {
    flight = { id: null, state: "invalid" };
    setFlightStatus(result.reason || `${parsed.display} does not seem to be a current flight. Check the number.`, "error");
  }
  form.dispatchEvent(new Event("input"));
}

/**
 * Keeps each accordion summary showing what is inside it, so a collapsed
 * section still tells you whether you filled it in — and makes sure a
 * required field can never be hidden when the browser validates the form.
 */
function wireAccordions() {
  const sections = $$(".accordion");

  const refresh = () => {
    const rating = $("#rating").value;
    const photos = attachments.length
      ? `${attachments.length} photo${attachments.length > 1 ? "s" : ""}`
      : "";
    setState("#state-meal", rating
      ? `${stars(rating)}<span class="label-text">${photos ? ` · ${photos}` : ""}</span>`
      : `<span class="label-text">${photos || "Not scored yet"}</span>`,
      Boolean(rating) || Boolean(photos));

    const scores = EXPERIENCE_SCORES.filter(({ key }) => $(`#${key}`).value).length;
    const written = $("#experience_notes").value.trim().length > 0;
    const parts = [];
    if (scores) parts.push(`${scores} of 2 scored`);
    if (written) parts.push("written");
    setState("#state-experience",
      `<span class="label-text">${parts.join(" · ") || "Nothing yet"}</span>`,
      parts.length > 0);

    setState("#state-byline",
      `<span class="label-text">${$("#post_as").value === "anon"
        ? "Anonymous"
        : esc(profile.display_name?.trim() || "Traveler")}</span>`, false);
  };

  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  drawThumbs.onchange = refresh;
  refresh();

  // A required control inside a closed <details> cannot be focused, so the
  // browser would block submission with no visible explanation. Open
  // everything first, and re-open whatever a validation error lands in.
  $("#submit-btn").addEventListener("click", () => {
    for (const section of sections) section.open = true;
  });
  for (const control of $$("#review-form input, #review-form select, #review-form textarea")) {
    control.addEventListener("invalid", () => {
      const section = control.closest(".accordion");
      if (section) section.open = true;
    });
  }
}

function setState(selector, html, isSet) {
  const target = $(selector);
  if (!target) return;
  target.innerHTML = html;
  target.classList.toggle("is-set", Boolean(isSet));
}

function wireBylineChoice() {
  const select = $("#post_as");
  const hint = $("#post-as-hint");
  const name = (profile.display_name || "").trim();

  select.querySelector('option[value="name"]').textContent =
    name ? `Post as ${name}` : "Post as Traveler (no display name set)";

  const describe = () => {
    hint.textContent = select.value === "anon"
      ? "Shown as “Anonymous”. Site admins can still see it was you, and your other ratings cannot be linked to this one."
      : name
        ? "You can change your display name any time on the My ratings page — your existing bylines update with it."
        : "Set a display name on the My ratings page to sign your ratings, or post anonymously instead.";
  };
  select.addEventListener("change", describe);
  describe();
}

/* ------------------------------------------------------------ edit an existing rating */

async function loadForEdit(id) {
  const { data, error } = await supabase.from("reviews").select("*").eq("id", id).maybeSingle();
  if (error || !data) {
    notify(msg, "That rating could not be loaded for editing.", "error");
    return;
  }
  editingId = data.id;
  $("#form-title").textContent = "Edit your rating";
  $("#submit-btn").textContent = "Save changes";
  $("#cancel-link").hidden = false;
  $("#cancel-link").href = "mine.html";

  for (const key of ["airline", "flight_number", "origin_city", "destination_city",
                     "flight_date", "cabin_class", "meal_type", "meal_name",
                     "hechsher", "comment", "experience_notes",
                     ...EXPERIENCE_SCORES.map((score) => score.key)]) {
    const field = document.getElementById(key);
    if (field) field.value = data[key] ?? "";
  }
  $("#rating").value = String(data.rating);
  if (data.flight_id) { flight = { id: data.flight_id, state: "ok" }; setFlightStatus("Flight on record", "ok"); }
  $("#post_as").value = data.is_anonymous ? "anon" : "name";
  $("#post_as").dispatchEvent(new Event("change"));
  attachments = (data.photos || []).map((path) => ({ path, url: photoUrl(path) }));
  drawThumbs();
}

/* ---------------------------------------------------------------------- photos */

async function addFiles(files) {
  for (const file of Array.from(files || [])) {
    if (attachments.length >= MAX_PHOTOS) break;
    if (!file.type.startsWith("image/")) continue;
    try {
      const resized = await shrinkImage(file);
      attachments.push({ file: resized, url: URL.createObjectURL(resized) });
    } catch {
      notify(msg, `Could not read ${file.name}.`, "error");
    }
  }
  drawThumbs();
}

$("#photos").addEventListener("change", async (event) => {
  const picked = event.target.files;
  await addFiles(picked);
  event.target.value = "";
});

/* Drag and drop onto the upload area, for anyone on a desktop. */
const uploader = $("#uploader");
if (uploader) {
  const setDragging = (on) => uploader.classList.toggle("is-dragging", on);

  for (const type of ["dragenter", "dragover"]) {
    uploader.addEventListener(type, (event) => {
      event.preventDefault();
      setDragging(true);
    });
  }
  uploader.addEventListener("dragleave", (event) => {
    if (!uploader.contains(event.relatedTarget)) setDragging(false);
  });
  uploader.addEventListener("drop", async (event) => {
    event.preventDefault();
    setDragging(false);
    await addFiles(event.dataTransfer?.files);
  });
  // Dropping anywhere else on the page should not navigate away from the form.
  for (const type of ["dragover", "drop"]) {
    window.addEventListener(type, (event) => {
      if (!uploader.contains(event.target)) event.preventDefault();
    });
  }
}

function drawThumbs() {
  drawThumbs.onchange?.();

  const hint = $("#uploader-hint");
  const full = attachments.length >= MAX_PHOTOS;
  if (hint) {
    hint.textContent = !attachments.length
      ? "Tap to choose, or drag them here"
      : full
        ? "Remove one to add another"
        : `${attachments.length} photo${attachments.length > 1 ? "s" : ""} added`;
  }
  $("#uploader")?.classList.toggle("is-full", full);

  thumbs.innerHTML = attachments
    .map((a, i) => `<div class="thumb">
        <img src="${esc(a.url)}" alt="Selected meal photo ${i + 1}">
        <button type="button" data-remove="${i}" title="Remove photo" aria-label="Remove photo">×</button>
      </div>`)
    .join("");
}

thumbs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  attachments.splice(Number(button.dataset.remove), 1);
  drawThumbs();
});

/** Scale a photo down and re-encode as JPEG so uploads stay small and EXIF is dropped. */
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("encode failed");
  return new File([blob], "meal.jpg", { type: "image/jpeg" });
}

async function uploadPending() {
  const paths = [];
  for (const attachment of attachments) {
    if (attachment.path) {
      paths.push(attachment.path);
      continue;
    }
    const path = `${profile.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, attachment.file, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

/* ---------------------------------------------------------------------- submit */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#submit-btn");
  button.disabled = true;
  notify(msg, editingId ? "Saving…" : "Posting…");

  const value = (id) => document.getElementById(id).value.trim();
  const orNull = (id) => value(id) || null;

  if (value("flight_number") && (flight.state === "invalid" || flight.state === "checking")) {
    if (flight.state === "checking") await checkFlight();
    if (flight.state === "invalid") {
      notify(msg, "That flight number did not check out. Fix it, or leave the field empty if you are not sure.", "error");
      $("#flight_number").focus();
      button.disabled = false;
      return;
    }
  }

  try {
    const photos = await uploadPending();
    const airlineRow = airlineByName(value("airline")) || (parseFlightNumber(value("flight_number")) && airlineByIata(parseFlightNumber(value("flight_number")).iata));
    const payload = {
      airline: value("airline"),
      airline_iata: airlineRow?.iata || null,
      flight_id: flight.state === "ok" ? flight.id : null,
      flight_number: orNull("flight_number"),
      origin_city: value("origin_city"),
      destination_city: orNull("destination_city"),
      flight_date: orNull("flight_date"),
      cabin_class: orNull("cabin_class"),
      meal_type: orNull("meal_type"),
      meal_name: orNull("meal_name"),
      hechsher: orNull("hechsher"),
      rating: Number(value("rating")),
      comment: orNull("comment"),
      experience_notes: orNull("experience_notes"),
      is_anonymous: $("#post_as").value === "anon",
      photos
    };
    for (const { key } of EXPERIENCE_SCORES) {
      payload[key] = value(key) ? Number(value(key)) : null;
    }

    const { error } = editingId
      ? await supabase.from("reviews").update(payload).eq("id", editingId)
      : await supabase.from("reviews").insert({ ...payload, user_id: profile.id });
    if (error) throw error;

    window.location.href = editingId ? "mine.html?saved=1" : "index.html?posted=1";
  } catch (error) {
    notify(msg, error.message || "Something went wrong. Please try again.", "error");
    button.disabled = false;
  }
});
