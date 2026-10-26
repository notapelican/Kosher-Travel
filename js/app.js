import { createClient } from "./vendor/supabase.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_NAME, GOOGLE_CLIENT_ID } from "./config.js";
import { EXPERIENCE_SCORES } from "./options.js";
import { applyDesign, cachedDesign, currentDesign, PRESETS } from "./design.js";
export { applyDesign, currentDesign, PRESETS };

export const isConfigured =
  !SUPABASE_URL.includes("YOUR-PROJECT-REF") && !SUPABASE_ANON_KEY.startsWith("YOUR-");

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export const PHOTO_BUCKET = "meal-photos";

/* ----------------------------------------------------------------- design */
// First paint uses the cached choice (also applied by the inline script in
// each page's <head>); the live setting is fetched and applied right after.
applyDesign(cachedDesign());
export const designReady = isConfigured
  ? supabase.from("site_settings").select("value").eq("key", "design").maybeSingle()
      .then(({ data }) => applyDesign(data?.value || cachedDesign()))
      .catch(() => currentDesign())
  : Promise.resolve(currentDesign());

export async function saveDesign(value) {
  const { error } = await supabase.from("site_settings")
    .upsert({ key: "design", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
  return applyDesign(value);
}

/**
 * The logo: a K whose stem is a fork (three tines at the top) and whose upper
 * arm is a plane climbing out of the letter: body, wings and nose, no tail, so
 * the plane is the K's arm rather than an icon beside it. One color
 * (currentColor), so it works on any background and in either theme. Drawn
 * once here and reused for the header badge and the empty states; the favicon
 * in each page's <head> is the same mark on the brand tile.
 */
export const LOGO = `
  <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
    <path d="M5.49 2.80 L6.47 2.80 L6.47 6.93 L5.49 6.93 Z"/>
    <path d="M6.96 2.80 L7.95 2.80 L7.95 6.93 L6.96 6.93 Z"/>
    <path d="M8.44 2.80 L9.42 2.80 L9.42 6.93 L8.44 6.93 Z"/>
    <path d="M5.49 6.63 L9.42 6.63 L9.42 28.74 L5.49 28.74 Z"/>
    <path d="M7.64 17.81 L19.03 29.20 L21.81 26.42 L10.42 15.03 Z"/>
    <path d="M9.09 18.01 L18.08 13.23 L16.38 10.04 L7.39 14.82 Z"/>
    <g transform="translate(17.14 11.68) rotate(62) scale(0.7860) translate(-16 -16)"><path d="M16 2.5 L18.099999999999998 7.3 L18.4 10.324000000000002 L25.3 18.694000000000003 L25.3 20.994000000000003 L18.4 15.224000000000002 L18.2 26.2 L13.799999999999999 26.2 L13.6 15.224000000000002 L6.699999999999999 20.994000000000003 L6.699999999999999 18.694000000000003 L13.6 10.324000000000002 L13.9 7.3 Z"/></g>
  </svg>`;

/* ------------------------------------------------------------------ utils */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function stars(rating, { fractional = false } = {}) {
  const value = Number(rating) || 0;
  if (!fractional) {
    const n = Math.round(value);
    return `<span class="stars" role="img" aria-label="${n} out of 5">${
      "★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;
  }
  // Averages get a partial fill, so 4.5 does not read as a perfect 5.
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return `<span class="stars fractional" role="img" aria-label="${value.toFixed(1)} out of 5">`
    + `<span class="off">★★★★★</span>`
    + `<span class="fill" style="width:${pct.toFixed(1)}%">★★★★★</span></span>`;
}

export function formatDate(value, opts = { dateStyle: "medium" }) {
  if (!value) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, opts);
}

export function timeAgo(value) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return "just now";
  const m = s / 60, h = m / 60, d = h / 24;
  if (h < 1) return `${Math.round(m)} min ago`;
  if (d < 1) return `${Math.round(h)}h ago`;
  if (d < 14) return `${Math.round(d)}d ago`;
  if (d < 60) return `${Math.round(d / 7)}w ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

/* --------------------------------------------------------------- airlines */

let airlinesCache;
/** Every airline the site knows, from the airlines table, cached per page. */
export async function loadAirlines() {
  if (airlinesCache) return airlinesCache;
  if (!isConfigured) return (airlinesCache = []);
  const { data } = await supabase.from("airlines").select("iata, icao, name, logo_url, active").order("name");
  return (airlinesCache = (data || []).filter((a) => a.active !== false));
}

/** Where a logo comes from when the airlines table has none: a public CDN keyed by IATA code. */
export function airlineLogoUrl(iata, logoUrl) {
  if (logoUrl) return logoUrl;
  return iata ? `https://images.kiwi.com/airlines/64/${encodeURIComponent(iata)}.png` : "";
}

/** Logo tile that falls back to the airline code if the image does not load. */
export function airlineLogo(iata, name = "", logoUrl = "", { large = false } = {}) {
  const url = airlineLogoUrl(iata, logoUrl);
  const code = esc(iata || (name || "?").slice(0, 2).toUpperCase());
  return `<span class="al-logo${large ? " lg" : ""}${url ? "" : " no-img"}" title="${esc(name)}">
    ${url ? `<img src="${esc(url)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('no-img')">` : ""}
    <span class="code">${code}</span></span>`;
}

/* ----------------------------------------------------------------- flights */

/** "LY 26", "ly026", "LY-26" -> { iata, number, display } or null. */
export function parseFlightNumber(raw) {
  const m = String(raw ?? "").trim().toUpperCase().match(/^([A-Z0-9]{2})[\s-]*0*(\d{1,4})$/);
  return m ? { iata: m[1], number: m[2], display: `${m[1]} ${m[2]}` } : null;
}

const flightMemo = new Map();
/**
 * Asks the flight-lookup Edge Function whether a flight exists.
 * Resolves to { found, flight } / { found:false, reason } / { unavailable:true }
 * when the function is not deployed, so callers can degrade gracefully.
 */
export async function lookupFlight(raw) {
  const parsed = parseFlightNumber(raw);
  if (!parsed) return { found: false, reason: "That does not look like a flight number (e.g. LY 26)." };
  const key = parsed.iata + parsed.number;
  if (flightMemo.has(key)) return flightMemo.get(key);
  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("flight-lookup", { body: { flight: parsed.display } });
      if (error || !data || data.error) return { unavailable: true, reason: data?.error || error?.message };
      return data;
    } catch (e) {
      return { unavailable: true, reason: e.message };
    }
  })();
  flightMemo.set(key, promise);
  return promise;
}

export function photoUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function notify(container, message, kind = "") {
  if (!container) return;
  container.className = `notice ${kind}`.trim();
  container.textContent = message;
  container.hidden = !message;
}

export function fillDatalist(id, values) {
  const list = document.getElementById(id);
  if (list) list.innerHTML = values.map((v) => `<option value="${esc(v)}"></option>`).join("");
}

export function fillSelect(select, values, placeholder) {
  if (!select) return;
  select.innerHTML =
    (placeholder ? `<option value="">${esc(placeholder)}</option>` : "") +
    values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
}

/* ------------------------------------------------------------------- auth */

let cachedProfile;

export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

export async function currentProfile({ refresh = false } = {}) {
  if (cachedProfile !== undefined && !refresh) return cachedProfile;
  const user = await currentUser();
  if (!user) return (cachedProfile = null);
  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, is_admin, is_banned")
    .eq("id", user.id)
    .maybeSingle();
  // The row is created by a trigger; fall back to the auth record if it is
  // not visible yet (very first login).
  return (cachedProfile = data ?? {
    id: user.id, email: user.email, display_name: null, is_admin: false, is_banned: false
  });
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href }
  });
  if (error) throw error;
}

/**
 * Google sign-in without leaving the site. Google Identity Services renders
 * its own button; when the visitor picks an account we hand the resulting ID
 * token to Supabase. The consent screen then names this domain rather than
 * the Supabase project, because nothing redirects there. Supabase requires a
 * nonce: the raw value goes to Supabase, its SHA-256 hash to Google.
 */
let gisLoading;
function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return (gisLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Google sign-in."));
    document.head.append(script);
  }));
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function renderGoogleButton(container, onError) {
  await loadGoogleIdentity();
  const rawNonce = crypto.randomUUID() + crypto.randomUUID();
  const hashedNonce = await sha256Hex(rawNonce);
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    nonce: hashedNonce,
    use_fedcm_for_prompt: true,
    callback: async ({ credential }) => {
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google", token: credential, nonce: rawNonce
      });
      if (error) return onError(error);
      window.location.reload();
    }
  });
  container.innerHTML = "";
  window.google.accounts.id.renderButton(container, {
    type: "standard", theme: "outline", size: "large", shape: "pill",
    text: "continue_with", width: Math.min(360, container.clientWidth || 320)
  });
}

export async function signInWithEmail(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  cachedProfile = undefined;
  window.location.reload();
}

/** Opens the sign-in dialog and resolves once the user is signed in (or cancels). */
export function openAuthDialog() {
  let dialog = $("#auth-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "auth-dialog";
    dialog.className = "sheet";
    dialog.innerHTML = `
      <h2 style="margin:0 0 6px">Sign in</h2>
      <p style="margin:0 0 18px;color:var(--muted);font-size:14px">
        Ratings are tied to an account so we can keep out spam. Rate as many meals as you like.
      </p>
      <div id="auth-google-gis" class="gis-slot" hidden></div>
      <button class="primary block" id="auth-google">Continue with Google</button>
      <div style="text-align:center;color:var(--muted);font-size:12px;margin:14px 0">or</div>
      <form id="auth-email-form">
        <div class="field">
          <label for="auth-email">Email a sign-in link</label>
          <input type="email" id="auth-email" required placeholder="you@example.com" autocomplete="email">
        </div>
        <button type="submit" class="block">Send link</button>
      </form>
      <div class="notice" id="auth-msg" hidden style="margin:14px 0 0"></div>
      <button id="auth-cancel" class="ghost block" style="margin-top:14px">Cancel</button>`;
    document.body.append(dialog);
  }
  const msg = $("#auth-msg", dialog);
  notify(msg, "");

  const fallback = $("#auth-google", dialog);
  fallback.onclick = async () => {
    try { await signInWithGoogle(); }
    catch (e) { notify(msg, e.message || "Google sign-in is not enabled yet.", "error"); }
  };
  if (GOOGLE_CLIENT_ID) {
    const slot = $("#auth-google-gis", dialog);
    slot.hidden = false;
    fallback.hidden = true;
    renderGoogleButton(slot, (e) => notify(msg, e.message || "Google sign-in failed.", "error"))
      .catch(() => { slot.hidden = true; fallback.hidden = false; });
  }
  $("#auth-email-form", dialog).onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      await signInWithEmail($("#auth-email", dialog).value.trim());
      notify(msg, "Check your email for the sign-in link.", "ok");
    } catch (e) {
      notify(msg, e.message || "Could not send the link.", "error");
    } finally {
      button.disabled = false;
    }
  };
  $("#auth-cancel", dialog).onclick = () => dialog.close();
  dialog.showModal();
  return dialog;
}

/* ----------------------------------------------------------------- header */

/** Tab bar / nav destinations. `icon` is a path drawn at 24x24. */
const NAV = [
  { href: "index.html", label: "Browse", short: "Browse",
    icon: "M4 7h16M4 12h16M4 17h10" },
  { href: "airlines.html", label: "Airlines", short: "Airlines",
    icon: "M12 3l7 9h-4l-3 9-3-9H5l7-9z" },
  { href: "submit.html", label: "Rate a meal", short: "Rate",
    icon: "M12 5v14M5 12h14" },
  { href: "mine.html", label: "My ratings", short: "Mine", signedIn: true,
    icon: "M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z" },
  { href: "admin.html", label: "Admin", short: "Admin", adminOnly: true,
    icon: "M12 3l8 4v6c0 4-3.4 7.2-8 8-4.6-.8-8-4-8-8V7l8-4z" }
];

function navFor(profile) {
  return NAV.filter((item) =>
    (!item.signedIn || profile) && (!item.adminOnly || profile?.is_admin));
}

function icon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

export async function renderHeader(active) {
  const header = $("#site-header");
  if (!header) return null;
  const profile = isConfigured ? await currentProfile() : null;
  const items = navFor(profile);
  const current = (href) => (active === href ? ' aria-current="page"' : "");

  header.innerHTML = `
    <div class="wrap">
      <a class="brand" href="index.html">
        <span class="brand-mark">${LOGO}</span>${esc(SITE_NAME)}</a>
      <nav class="nav" aria-label="Main">
        ${items.map((item) =>
          `<a class="navlink" href="${item.href}"${current(item.href)}>${esc(item.label)}</a>`).join("")}
      </nav>
      <div class="header-account">
        ${profile
          ? `<span class="whoami">${esc(profile.display_name || profile.email)}</span>
             <button class="small" id="nav-signout">Sign out</button>`
          : `<button class="small primary" id="nav-signin">Sign in</button>`}
      </div>
    </div>`;

  $("#nav-signout", header)?.addEventListener("click", signOut);
  $("#nav-signin", header)?.addEventListener("click", () => openAuthDialog());

  // Bottom tab bar: the primary navigation on phones, hidden from 860px up.
  let tabbar = $("#tabbar");
  if (!tabbar) {
    tabbar = document.createElement("nav");
    tabbar.id = "tabbar";
    tabbar.className = "tabbar";
    tabbar.setAttribute("aria-label", "Main");
    document.body.append(tabbar);
  }
  tabbar.innerHTML = items.map((item) => `
    <a href="${item.href}"${current(item.href)}>
      ${icon(item.icon)}<span>${esc(item.short)}</span>
    </a>`).join("");

  return profile;
}

export function renderSetupWarning() {
  const target = $("#page-notice") || $("main .wrap") || document.body;
  const box = document.createElement("div");
  box.className = "notice error";
  box.innerHTML = `<b>Not connected yet.</b> Add your Supabase project URL and anon key to
    <code>js/config.js</code>, and run <code>supabase/schema.sql</code> in the Supabase SQL editor.
    See the <a href="https://github.com/notapelican/Kosher-Travel#setup">setup steps</a>.`;
  target.prepend(box);
}

/** Empty state with the logo watermarked above it. */
export function emptyState(title, body = "") {
  return `<div class="empty">
    <span class="empty-mark">${LOGO}</span>
    <b>${esc(title)}</b>
    ${body}
  </div>`;
}

/* ---------------------------------------------------- review card + photos */

/**
 * The meals on a report, in order. Rows from reviews_public carry them as
 * `meals`; rows read from reviews with review_meals(*) embedded carry
 * `review_meals`; a report saved before meals had their own table has its
 * one meal in its own columns.
 */
export function reportMeals(review) {
  const rows = review.meals ?? review.review_meals;
  if (Array.isArray(rows) && rows.length) {
    return [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  if (review.rating == null) return [];
  return [{ position: 1, meal_type: review.meal_type, meal_name: review.meal_name, hechsher: review.hechsher,
            rating: review.rating, comment: review.comment, photos: review.photos || [] }];
}

/** Every stored photo of a report row read with review_meals(photos) embedded, legacy ones included. */
export function reportPhotoPaths(row) {
  return [...new Set([...(row?.photos || []), ...(row?.review_meals || []).flatMap((m) => m.photos || [])])];
}

export function reviewCard(review, { actions = "", bylineNote = "" } = {}) {
  const meals = reportMeals(review);
  const several = meals.length > 1;
  const only = meals[0] || {};
  const rating = meals.length
    ? meals.reduce((sum, m) => sum + Number(m.rating || 0), 0) / meals.length
    : Number(review.rating) || 0;
  const seals = [...new Set(meals.map((m) => (m.hechsher || "").trim()).filter(Boolean))];

  const route = [review.origin_city || review.origin_iata, review.destination_city || review.destination_iata].filter(Boolean).join(" → ");
  const tags = [
    ...seals.map((seal) => `<span class="tag hechsher">${esc(seal)}</span>`),
    !several && only.meal_type ? `<span class="tag">${esc(only.meal_type)}</span>` : "",
    review.cabin_class ? `<span class="tag">${esc(review.cabin_class)}</span>` : "",
    review.flight_date ? `<span class="tag">Flown ${esc(formatDate(review.flight_date))}</span>` : "",
    review.aircraft ? `<span class="tag">${esc(review.aircraft)}</span>` : ""
  ].join("");

  const photoPaths = meals.length ? meals.flatMap((m) => m.photos || []) : (review.photos || []);
  const photos = photoPaths
    .map((p) => `<img src="${esc(photoUrl(p))}" alt="Photo of the meal" loading="lazy"
                      decoding="async" data-full="${esc(photoUrl(p))}">`)
    .join("");

  // Several meals: one line each with its own score; the seal is repeated
  // per meal only when the meals do not all carry the same one.
  const mealList = several
    ? `<ol class="meal-list">${meals.map((m, i) => `
        <li>
          <div class="meal-line">
            <span class="meal-what"><b>${esc(m.meal_type || `Meal ${i + 1}`)}</b>${
              m.meal_name ? ` ${esc(m.meal_name)}` : ""}</span>
            <span class="meal-score">${stars(m.rating)}<span class="n">${esc(m.rating)}</span></span>
          </div>
          ${seals.length > 1 && m.hechsher ? `<div class="meal-seal">${esc(m.hechsher)}</div>` : ""}
          ${m.comment ? `<p class="comment">${esc(m.comment)}</p>` : ""}
        </li>`).join("")}</ol>`
    : "";

  const scored = EXPERIENCE_SCORES.filter(({ key }) => review[key]);
  // The experience panel stands on its own: a reviewer may leave scores, a
  // write-up, or both.
  const experience = (scored.length || review.experience_notes)
    ? `<div class="subscores">
         <div class="subscores-head">The travel experience</div>
         ${scored.map(({ key, label }) => `
           <div class="subscore">
             <span>${esc(label)}</span>
             <span class="meter"><i style="width:${(review[key] / 5) * 100}%"></i></span>
             <span class="val">${esc(review[key])}<span class="hint">/5</span></span>
           </div>`).join("")}
         ${review.experience_notes
            ? `<p class="experience-notes">${esc(review.experience_notes)}</p>` : ""}
       </div>`
    : "";

  const title = [review.airline, review.flight_number].filter(Boolean).join(" ");
  const byline = review.is_anonymous ? "Anonymous" : (review.author_name || "Traveler");
  const logo = review.airline_iata || review.airline
    ? airlineLogo(review.airline_iata, review.airline, review.airline_logo_url) : "";
  const operated = review.codeshare && review.operating_iata && review.operating_iata !== review.airline_iata
    ? `<div class="operated">Operated by ${esc(review.operating_iata)}</div>` : "";
  const badge = several
    ? `${stars(rating, { fractional: true })}
       <div class="num">${esc(rating.toFixed(1))}<small>/5 · ${meals.length} meals</small></div>`
    : `${stars(rating)}
       <div class="num">${esc(rating)}<small>/5 meal</small></div>`;

  return `
    <article class="review${several ? " several" : ""}" data-id="${esc(review.id)}">
      <div class="review-top">
        <div>
          <div class="review-head">${logo}<h3>${esc(title || "Unknown flight")}</h3></div>
          ${operated}
          <div class="route">${esc(route)}${
            !several && only.meal_name ? `<span class="sep">·</span>${esc(only.meal_name)}` : ""}</div>
        </div>
        <div class="score-badge">${badge}</div>
      </div>
      ${tags ? `<div class="meta">${tags}</div>` : ""}
      ${!several && only.comment ? `<p class="comment">${esc(only.comment)}</p>` : ""}
      ${mealList}
      ${experience}
      ${photos ? `<div class="photos">${photos}</div>` : ""}
      <div class="byline"><b>${esc(byline)}</b>${
        bylineNote ? ` <span class="hint">${esc(bylineNote)}</span>` : ""} · ${esc(formatDate(review.created_at))}</div>
      ${review.is_hidden ? `<div class="hidden-flag">Hidden from the public list</div>` : ""}
      ${actions ? `<div class="row-actions">${actions}</div>` : ""}
    </article>`;
}

/** Click any review photo to open it full size. Call once per page. */
export function enablePhotoLightbox(root = document) {
  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.innerHTML = `<img alt="Meal photo, full size">`;
  dialog.addEventListener("click", () => dialog.close());
  document.body.append(dialog);

  root.addEventListener("click", (event) => {
    const img = event.target.closest(".photos img");
    if (!img) return;
    dialog.querySelector("img").src = img.dataset.full || img.src;
    dialog.showModal();
  });
}
