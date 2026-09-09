import {
  supabase, isConfigured, renderHeader, renderSetupWarning,
  openAuthDialog, notify, fillDatalist, fillSelect, photoUrl, PHOTO_BUCKET, stars, $, $$, esc
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

  const id = new URLSearchParams(location.search).get("edit");
  if (id) await loadForEdit(id);
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
    setState("#state-meal", rating
      ? `${stars(rating)}<span class="label-text">${photoLabel()}</span>`
      : `<span class="label-text">Not scored yet</span>`, Boolean(rating));

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

  const photoLabel = () =>
    attachments.length ? ` · ${attachments.length} photo${attachments.length > 1 ? "s" : ""}` : "";

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
  $("#post_as").value = data.is_anonymous ? "anon" : "name";
  $("#post_as").dispatchEvent(new Event("change"));
  attachments = (data.photos || []).map((path) => ({ path, url: photoUrl(path) }));
  drawThumbs();
}

/* ---------------------------------------------------------------------- photos */

$("#photos").addEventListener("change", async (event) => {
  const picked = Array.from(event.target.files || []);
  event.target.value = "";
  for (const file of picked) {
    if (attachments.length >= MAX_PHOTOS) {
      notify(msg, `Up to ${MAX_PHOTOS} photos per rating.`, "error");
      break;
    }
    if (!file.type.startsWith("image/")) continue;
    try {
      const resized = await shrinkImage(file);
      attachments.push({ file: resized, url: URL.createObjectURL(resized) });
    } catch {
      notify(msg, `Could not read ${file.name}.`, "error");
    }
  }
  drawThumbs();
});

function drawThumbs() {
  drawThumbs.onchange?.();
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

  try {
    const photos = await uploadPending();
    const payload = {
      airline: value("airline"),
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
