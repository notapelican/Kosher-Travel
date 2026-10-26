import {
  supabase, isConfigured, renderHeader, renderSetupWarning, openAuthDialog, notify, fillDatalist,
  fillSelect, photoUrl, PHOTO_BUCKET, stars, loadAirlines, lookupFlight, parseFlightNumber, reportMeals, $, $$, esc
} from "./app.js";
import { AIRLINES, HECHSHERIM, MEAL_TYPES, CABIN_CLASSES, EXPERIENCE_SCORES } from "./options.js";
import { airportPicker } from "./airports.js";

const form = $("#review-form");
const gate = $("#signin-gate");
const msg = $("#form-msg");
const mealsBox = $("#meals");
const MAX_MEALS = 6;
const MAX_PHOTOS = 4;       // per meal
const MAX_EDGE = 1600;      // px, longest side after client-side resize
const JPEG_QUALITY = 0.82;

/**
 * The meals on this report, in order. Each has its own block in the form and
 * its own photos: { key, el, attachments: [{ file?, path?, url }] }, where
 * path is set once a photo is uploaded or was already saved.
 */
let meals = [];
let nextMealKey = 1;
let savedPhotos = [];              // photo paths the report had when loaded for editing
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

// Only real airports: both fields refuse anything not picked from the list.
// While empty, they offer the airports of the flight that was looked up.
const originPicker = airportPicker($("#origin_city"), {
  strict: true, suggest: () => [flight.data?.origin_iata, flight.data?.destination_iata]
});
const destinationPicker = airportPicker($("#destination_city"), {
  strict: true, suggest: () => [flight.data?.destination_iata]
});

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
  if (!meals.length) addMeal();
  if (!params.get("edit") && params.get("flight")) {
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
    // The meals are usually loaded where the flight departs, but not always
    // (some airlines cater the return leg too), so the origin is offered, not filled in.
    if (!$("#destination_city").value.trim() && f.destination_iata) await destinationPicker.setCode(f.destination_iata);
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
  const refresh = () => {
    for (const meal of meals) refreshMealState(meal);

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
  refresh();

  // A required control inside a closed <details> cannot be focused, so the
  // browser would block submission with no visible explanation. Open
  // everything first, and re-open whatever a validation error lands in.
  // Meal blocks come and go, so listen on the form ("invalid" only reaches
  // it while capturing).
  $("#submit-btn").addEventListener("click", () => {
    for (const section of $$(".accordion", form)) section.open = true;
  });
  form.addEventListener("invalid", (event) => {
    const section = event.target.closest(".accordion");
    if (section) section.open = true;
  }, true);
}

function refreshMealState(meal) {
  const rating = field(meal, "rating").value;
  const n = meal.attachments.length;
  const photos = n ? `${n} photo${n > 1 ? "s" : ""}` : "";
  setState(meal.el.querySelector(".accordion-state"), rating
    ? `${stars(rating)}<span class="label-text">${photos ? ` · ${photos}` : ""}</span>`
    : `<span class="label-text">${photos || "Not scored yet"}</span>`,
    Boolean(rating) || Boolean(photos));
  const kind = field(meal, "meal_type").value;
  const what = field(meal, "meal_name").value.trim();
  meal.el.querySelector(".accordion-sub").textContent =
    [kind, what].filter(Boolean).join(" · ") || "Score it, describe it, add photos";
}

function setState(selector, html, isSet) {
  const target = typeof selector === "string" ? $(selector) : selector;
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

/* ----------------------------------------------------------------- meal blocks */

const SCORE_OPTIONS = `
  <option value="">Pick a score</option>
  <option value="5">★★★★★ — genuinely good</option>
  <option value="4">★★★★ — solid</option>
  <option value="3">★★★ — fine, ate it</option>
  <option value="2">★★ — rough</option>
  <option value="1">★ — inedible</option>`;

const UPLOAD_ICON = `
  <svg viewBox="0 0 32 32" fill="none">
    <path d="M16 3.2c1.3 0 2.1 1.6 2.1 3.7v14.3l1.9 2.4v2L16 24.3l-4 1.3v-2l1.9-2.4V6.9c0-2.1.8-3.7 2.1-3.7Z" fill="currentColor"/>
    <path d="M13.4 11.6H6.9v1.4H2.4v1.3h4.5v1.4h6.5z" fill="currentColor"/>
    <path d="M18.6 11.9h5.1c3 0 5.6 1 5.6 2s-2.6 2-5.6 2h-5.1z" fill="currentColor"/>
  </svg>`;

/** The control for one of a meal's fields: meal_type, rating, hechsher, meal_name, comment, photos. */
function field(meal, name) {
  return meal.el.querySelector(`[data-f="${name}"]`);
}

/** Adds a meal block, filled from `data` when editing. Returns the meal. */
function addMeal(data = {}) {
  if (meals.length >= MAX_MEALS) return null;
  const key = nextMealKey++;
  const id = (name) => `m${key}-${name}`;
  const el = document.createElement("details");
  el.className = "accordion meal-block";
  el.open = true;
  el.innerHTML = `
    <summary>
      <span>
        <span class="accordion-title">The meal</span>
        <span class="accordion-sub">Score it, describe it, add photos</span>
      </span>
      <span class="accordion-state"></span>
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </summary>
    <div class="accordion-body">
      <div class="grid-2">
        <div class="field">
          <label for="${id("rating")}">Meal score <span class="hint">required</span></label>
          <select id="${id("rating")}" data-f="rating" required>${SCORE_OPTIONS}</select>
        </div>
        <div class="field">
          <label for="${id("meal_type")}">Which meal</label>
          <select id="${id("meal_type")}" data-f="meal_type"></select>
        </div>
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="${id("hechsher")}">Hechsher on the seal</label>
          <input id="${id("hechsher")}" data-f="hechsher" list="hechsherim" autocomplete="off" placeholder="Belz Machzikei Hadass">
        </div>
        <div class="field">
          <label for="${id("meal_name")}">What was it? <span class="hint">e.g. chicken and rice</span></label>
          <input id="${id("meal_name")}" data-f="meal_name" autocomplete="off" placeholder="Grilled chicken, rice, cold salad">
        </div>
      </div>
      <div class="field">
        <label for="${id("comment")}">About the meal <span class="hint">optional</span></label>
        <textarea id="${id("comment")}" data-f="comment" maxlength="4000"
          placeholder="Was it served hot? Still sealed? Did the crew know where it was? What was actually in the tray, and would you eat it again?"></textarea>
      </div>
      <div class="field">
        <label for="${id("photos")}">Photos of the meal</label>
        <input type="file" id="${id("photos")}" data-f="photos" accept="image/*" multiple class="sr-only">
        <label class="uploader" for="${id("photos")}">
          <span class="uploader-icon" aria-hidden="true">${UPLOAD_ICON}</span>
          <span class="uploader-text">
            <b>Add photos of the tray</b>
            <span class="hint uploader-hint">Tap to choose, or drag them here</span>
          </span>
        </label>
        <div class="thumbs"></div>
      </div>
      <div class="meal-remove"><button type="button" class="small ghost" data-remove-meal>Remove this meal</button></div>
    </div>`;

  const meal = { key, el, attachments: [] };
  fillSelect(field(meal, "meal_type"), MEAL_TYPES, "Not sure");
  for (const name of ["meal_type", "hechsher", "meal_name", "comment"]) field(meal, name).value = data[name] ?? "";
  if (data.rating) field(meal, "rating").value = String(data.rating);
  // a meal type saved before the list changed still shows
  if (data.meal_type && field(meal, "meal_type").value !== data.meal_type) {
    field(meal, "meal_type").insertAdjacentHTML("beforeend", `<option>${esc(data.meal_type)}</option>`);
    field(meal, "meal_type").value = data.meal_type;
  }
  meal.attachments = (data.photos || []).map((path) => ({ path, url: photoUrl(path) }));

  wireMealPhotos(meal);
  el.querySelector("[data-remove-meal]").addEventListener("click", () => removeMeal(meal));

  meals.push(meal);
  mealsBox.append(el);
  drawThumbs(meal);
  renumberMeals();
  return meal;
}

function removeMeal(meal) {
  const filled = field(meal, "rating").value || field(meal, "meal_name").value.trim()
    || field(meal, "comment").value.trim() || meal.attachments.length;
  if (filled && !confirm("Remove this meal and what you entered for it?")) return;
  meals = meals.filter((m) => m !== meal);
  meal.el.remove();
  renumberMeals();
  form.dispatchEvent(new Event("input"));
}

/** Titles read "The meal" for one, "Meal 1", "Meal 2"… for several. */
function renumberMeals() {
  const several = meals.length > 1;
  meals.forEach((meal, i) => {
    meal.el.querySelector(".accordion-title").textContent = several ? `Meal ${i + 1}` : "The meal";
    meal.el.querySelector(".meal-remove").hidden = !several;
  });
  const full = meals.length >= MAX_MEALS;
  $("#add-meal").hidden = full;
  $("#add-meal-hint").textContent = meals.length === 1
    ? "Breakfast, a snack, the second service"
    : `${MAX_MEALS - meals.length} more can be added`;
}

$("#add-meal").addEventListener("click", () => {
  // fold away meals that are already scored, so the new one is easy to find
  for (const meal of meals) if (field(meal, "rating").value) meal.el.open = false;
  const meal = addMeal();
  if (!meal) return;
  form.dispatchEvent(new Event("input"));
  meal.el.scrollIntoView({ behavior: "smooth", block: "start" });
  field(meal, "rating").focus({ preventScroll: true });
});

/* ------------------------------------------------------------ edit an existing rating */

async function loadForEdit(id) {
  const { data, error } = await supabase.from("reviews").select("*, review_meals(*)").eq("id", id).maybeSingle();
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
                     "flight_date", "cabin_class", "experience_notes",
                     ...EXPERIENCE_SCORES.map((score) => score.key)]) {
    const control = document.getElementById(key);
    if (control) control.value = data[key] ?? "";
  }
  if (data.flight_id) { flight = { id: data.flight_id, state: "ok" }; setFlightStatus("Flight on record", "ok"); }
  // older reports may hold free text: it is tidied to "City (IATA)" if it names one airport, flagged if not
  originPicker.recheck();
  destinationPicker.recheck();
  $("#post_as").value = data.is_anonymous ? "anon" : "name";
  $("#post_as").dispatchEvent(new Event("change"));

  const saved = reportMeals(data);
  savedPhotos = saved.flatMap((m) => m.photos || []);
  for (const m of saved) addMeal({ ...m, photos: (m.photos || []).slice(0, MAX_PHOTOS) });
  // a long report opens folded, so the flight and the meal list fit on screen
  if (meals.length > 1) for (const meal of meals) meal.el.open = false;
  form.dispatchEvent(new Event("input"));
}

/* ---------------------------------------------------------------------- photos */

async function addFiles(meal, files) {
  for (const file of Array.from(files || [])) {
    if (meal.attachments.length >= MAX_PHOTOS) break;
    if (!file.type.startsWith("image/")) continue;
    try {
      const resized = await shrinkImage(file);
      meal.attachments.push({ file: resized, url: URL.createObjectURL(resized) });
    } catch {
      notify(msg, `Could not read ${file.name}.`, "error");
    }
  }
  drawThumbs(meal);
}

function wireMealPhotos(meal) {
  field(meal, "photos").addEventListener("change", async (event) => {
    await addFiles(meal, event.target.files);
    event.target.value = "";
  });

  meal.el.querySelector(".thumbs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    meal.attachments.splice(Number(button.dataset.remove), 1);
    drawThumbs(meal);
  });

  /* Drag and drop onto the upload area, for anyone on a desktop. */
  const uploader = meal.el.querySelector(".uploader");
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
    await addFiles(meal, event.dataTransfer?.files);
  });
}

// Dropping a photo anywhere but an upload area should not navigate away from the form.
for (const type of ["dragover", "drop"]) {
  window.addEventListener(type, (event) => {
    if (!event.target.closest?.(".uploader")) event.preventDefault();
  });
}

function drawThumbs(meal) {
  const { attachments, el } = meal;
  const hint = el.querySelector(".uploader-hint");
  const full = attachments.length >= MAX_PHOTOS;
  hint.textContent = !attachments.length
    ? "Tap to choose, or drag them here"
    : full
      ? "Remove one to add another"
      : `${attachments.length} photo${attachments.length > 1 ? "s" : ""} added`;
  el.querySelector(".uploader").classList.toggle("is-full", full);

  el.querySelector(".thumbs").innerHTML = attachments
    .map((a, i) => `<div class="thumb">
        <img src="${esc(a.url)}" alt="Selected meal photo ${i + 1}">
        <button type="button" data-remove="${i}" title="Remove photo" aria-label="Remove photo">×</button>
      </div>`)
    .join("");
  refreshMealState(meal);
}

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

/** Uploads a meal's new photos; returns the storage paths of all its photos. */
async function uploadPending(meal) {
  const paths = [];
  for (const attachment of meal.attachments) {
    if (!attachment.path) {
      const path = `${profile.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, attachment.file, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw error;
      attachment.path = path;   // a retry after a failed save does not upload it twice
    }
    paths.push(attachment.path);
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
    const mealRows = [];
    for (const meal of meals) {
      const text = (name) => field(meal, name).value.trim() || null;
      mealRows.push({
        meal_type: text("meal_type"),
        meal_name: text("meal_name"),
        hechsher: text("hechsher"),
        rating: Number(field(meal, "rating").value),
        comment: text("comment"),
        photos: await uploadPending(meal)
      });
    }

    const airlineRow = airlineByName(value("airline")) || (parseFlightNumber(value("flight_number")) && airlineByIata(parseFlightNumber(value("flight_number")).iata));
    const report = {
      airline: value("airline"),
      airline_iata: airlineRow?.iata || null,
      flight_id: flight.state === "ok" ? flight.id : null,
      flight_number: orNull("flight_number"),
      origin_city: originPicker.label() || value("origin_city"),
      destination_city: destinationPicker.label() || orNull("destination_city"),
      flight_date: orNull("flight_date"),
      cabin_class: orNull("cabin_class"),
      experience_notes: orNull("experience_notes"),
      is_anonymous: $("#post_as").value === "anon"
    };
    for (const { key } of EXPERIENCE_SCORES) {
      report[key] = value(key) ? Number(value(key)) : null;
    }

    const { error } = await supabase.rpc("save_report", { report, meals: mealRows, report_id: editingId });
    if (error) {
      if (error.code === "PGRST202") throw new Error("The site's database needs migration 005 (multiple meals) before ratings can be posted.");
      throw error;
    }

    // photos taken off the report while editing are no longer used anywhere
    const kept = new Set(mealRows.flatMap((m) => m.photos));
    const dropped = savedPhotos.filter((path) => !kept.has(path) && !/^https?:/.test(path));
    if (dropped.length) await supabase.storage.from(PHOTO_BUCKET).remove(dropped);

    window.location.href = editingId ? "mine.html?saved=1" : "index.html?posted=1";
  } catch (error) {
    notify(msg, error.message || "Something went wrong. Please try again.", "error");
    button.disabled = false;
  }
});
