import { createClient } from "./vendor/supabase.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_NAME } from "./config.js";
import { EXPERIENCE_SCORES } from "./options.js";

export const isConfigured =
  !SUPABASE_URL.includes("YOUR-PROJECT-REF") && !SUPABASE_ANON_KEY.startsWith("YOUR-");

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export const PHOTO_BUCKET = "meal-photos";

/**
 * The logo: a K whose upper arm is a plane climbing out of the letter. Stem
 * and leg share one stroke weight with flat ends; the plane sits on the K's
 * diagonal, clear of the joint. One color (currentColor), so it works on any
 * background and in either theme. Drawn once here and reused for the header
 * badge and the empty states. The favicon in each page's <head> is the same
 * mark on the brand tile, with the tail fin dropped since it is noise at 16px.
 */
export const LOGO = `
  <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
    <path d="M7.20 5.74 L11.01 5.74 L11.01 27.48 L7.20 27.48 Z"/>
    <path d="M9.30 18.50 L19.80 29.00 L22.49 26.31 L11.99 15.81 Z"/>
    <g transform="translate(19.09 8.71) rotate(45) scale(0.5978) translate(-16 -16)"><path d="M16 2.5 L18 7 L18.4 12.5 L29.5 22.5 L29.5 24.8 L18.4 20.2 L18 25.5 L21.5 28.2 L21.5 29.8 L16 28.4 L10.5 29.8 L10.5 28.2 L14 25.5 L13.6 20.2 L2.5 24.8 L2.5 22.5 L13.6 12.5 L14 7 Z"/></g>
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

  $("#auth-google", dialog).onclick = async () => {
    try { await signInWithGoogle(); }
    catch (e) { notify(msg, e.message || "Google sign-in is not enabled yet.", "error"); }
  };
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

export function reviewCard(review, { actions = "", bylineNote = "" } = {}) {
  const route = [review.origin_city, review.destination_city].filter(Boolean).join(" → ");
  const tags = [
    review.hechsher ? `<span class="tag hechsher">${esc(review.hechsher)}</span>` : "",
    review.meal_type ? `<span class="tag">${esc(review.meal_type)}</span>` : "",
    review.cabin_class ? `<span class="tag">${esc(review.cabin_class)}</span>` : "",
    review.flight_date ? `<span class="tag">Flown ${esc(formatDate(review.flight_date))}</span>` : ""
  ].join("");

  const photos = (review.photos || [])
    .map((p) => `<img src="${esc(photoUrl(p))}" alt="Photo of the meal" loading="lazy"
                      decoding="async" data-full="${esc(photoUrl(p))}">`)
    .join("");

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

  return `
    <article class="review" data-id="${esc(review.id)}">
      <div class="review-top">
        <div>
          <h3>${esc(title || "Unknown flight")}</h3>
          <div class="route">${esc(route)}${
            review.meal_name ? `<span class="sep">·</span>${esc(review.meal_name)}` : ""}</div>
        </div>
        <div class="score-badge">
          ${stars(review.rating)}
          <div class="num">${esc(review.rating)}<small>/5 meal</small></div>
        </div>
      </div>
      ${tags ? `<div class="meta">${tags}</div>` : ""}
      ${review.comment ? `<p class="comment">${esc(review.comment)}</p>` : ""}
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
