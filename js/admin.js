import {
  supabase, isConfigured, renderHeader, renderSetupWarning, reviewCard, enablePhotoLightbox,
  notify, formatDate, esc, PHOTO_BUCKET, PRESETS, currentDesign, designReady, saveDesign, reportPhotoPaths, $
} from "./app.js";

const msg = $("#admin-msg");
const list = $("#reviews");
const usersBody = $("#users-body");
let profile = null;
/** user id -> profile, so anonymous reviews can still be attributed here. */
let usersById = new Map();

enablePhotoLightbox(list);
init();

async function init() {
  profile = await renderHeader("admin.html");
  if (!isConfigured) return renderSetupWarning();

  if (!profile) return notify(msg, "Sign in with an admin account to use this page.", "error");
  if (!profile.is_admin) return notify(msg, "This account is not an admin.", "error");

  $("#admin-body").hidden = false;
  wireTabs();
  designReady.then(renderDesignOptions);
  // users first, so anonymous reviews can be attributed on the ratings tab
  await loadUsers();
  await loadReviews();
}

function wireTabs() {
  const tabs = [["#tab-reviews", "#panel-reviews"], ["#tab-users", "#panel-users"], ["#tab-design", "#panel-design"]];
  for (const [tabSel, panelSel] of tabs) {
    $(tabSel).addEventListener("click", () => {
      for (const [t, p] of tabs) {
        const selected = t === tabSel;
        $(t).setAttribute("aria-selected", String(selected));
        $(p).hidden = !selected;
      }
    });
  }
}

/* ---------------------------------------------------------------------- design */

const THUMBS = { board: "a", night: "b", cabin: "c", window: "d" };

function renderDesignOptions() {
  const active = currentDesign().preset;
  $("#design-options").innerHTML = Object.entries(PRESETS).map(([id, p]) => `
    <label class="design-option${id === active ? " is-active" : ""}">
      <input type="radio" name="design" value="${id}" ${id === active ? "checked" : ""}>
      <span class="design-thumb">${THUMBS[id]
        ? `<img src="design-review/shots/${THUMBS[id]}-desk.jpg" alt="" loading="lazy">`
        : `<span class="design-swatch"></span>`}</span>
      <span class="design-text"><b>${esc(p.label)}</b><span class="hint">${esc(p.blurb)}</span></span>
      ${id === active ? `<span class="tag">Live</span>` : ""}
    </label>`).join("");
}

$("#design-options").addEventListener("change", async (event) => {
  const id = event.target.value;
  if (!PRESETS[id]) return;
  try {
    await saveDesign({ preset: id, ...PRESETS[id] });
    notify(msg, `Design set to “${PRESETS[id].label}”. Visitors see it on their next page load.`, "ok");
    renderDesignOptions();
  } catch (e) {
    notify(msg, e.message, "error");
  }
});

/* --------------------------------------------------------------------- ratings */

async function loadReviews() {
  const q = $("#a-q").value.trim();
  const visibility = $("#a-visibility").value;

  let query = supabase.from("reviews").select("*, review_meals(*)").order("created_at", { ascending: false }).limit(200);
  if (visibility === "visible") query = query.eq("is_hidden", false);
  if (visibility === "hidden") query = query.eq("is_hidden", true);
  if (q) {
    const term = `%${q.replace(/[,()]/g, " ")}%`;
    // meal text lives on review_meals: find those reports first
    const { data: hits } = await supabase.from("review_meals").select("review_id")
      .or(["meal_type", "meal_name", "hechsher", "comment"].map((col) => `${col}.ilike.${term}`).join(","))
      .limit(500);
    const ids = [...new Set((hits || []).map((h) => h.review_id))];
    query = query.or([
      ...["airline", "flight_number", "origin_city", "destination_city", "meal_name", "hechsher", "comment", "experience_notes", "author_name"]
        .map((col) => `${col}.ilike.${term}`),
      ...(ids.length ? [`id.in.(${ids.join(",")})`] : [])
    ].join(","));
  }

  const { data, error } = await query;
  if (error) return notify(msg, error.message, "error");

  list.innerHTML = data.length
    ? data.map((review) => reviewCard(review, {
        bylineNote: review.is_anonymous
          ? `(anonymous — ${usersById.get(review.user_id)?.email || review.user_id})`
          : "",
        actions: `<a class="btn small" href="submit.html?edit=${review.id}">Edit</a>
                  <button class="small" data-toggle="${review.id}" data-hidden="${review.is_hidden}">
                    ${review.is_hidden ? "Unhide" : "Hide"}</button>
                  <button class="small danger" data-delete="${review.id}">Delete</button>`
      })).join("")
    : `<div class="empty">No ratings match.</div>`;
}

list.addEventListener("click", async (event) => {
  const toggle = event.target.closest("[data-toggle]");
  const remove = event.target.closest("[data-delete]");
  if (!toggle && !remove) return;

  const button = toggle || remove;
  button.disabled = true;

  if (toggle) {
    const { error } = await supabase
      .from("reviews")
      .update({ is_hidden: toggle.dataset.hidden !== "true" })
      .eq("id", toggle.dataset.toggle);
    if (error) notify(msg, error.message, "error");
  } else {
    if (!confirm("Delete this rating and its photos permanently?")) {
      button.disabled = false;
      return;
    }
    const id = remove.dataset.delete;
    const { data: row } = await supabase.from("reviews").select("photos, review_meals(photos)").eq("id", id).maybeSingle();
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) {
      notify(msg, error.message, "error");
      button.disabled = false;
      return;
    }
    const photos = reportPhotoPaths(row);
    if (photos.length) await supabase.storage.from(PHOTO_BUCKET).remove(photos);
  }
  await Promise.all([loadReviews(), loadUsers()]);
});

let debounce;
$("#admin-filters").addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(loadReviews, 250);
});
$("#admin-filters").addEventListener("reset", () => setTimeout(loadReviews, 0));
$("#admin-filters").addEventListener("submit", (event) => event.preventDefault());

/* ----------------------------------------------------------------------- users */

async function loadUsers() {
  const [{ data: users, error }, { data: counts }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("reviews").select("user_id").limit(5000)
  ]);
  if (error) return notify(msg, error.message, "error");

  usersById = new Map(users.map((user) => [user.id, user]));

  const byUser = new Map();
  for (const row of counts || []) byUser.set(row.user_id, (byUser.get(row.user_id) || 0) + 1);

  usersBody.innerHTML = users.map((user) => {
    const self = user.id === profile.id;
    const total = byUser.get(user.id) || 0;
    return `<tr data-user="${esc(user.id)}">
      <td data-label="">${esc(user.display_name || "—")}${self ? " <span class=\"hint\">(you)</span>" : ""}</td>
      <td data-label="Email">${esc(user.email || "—")}</td>
      <td data-label="Ratings">${total}</td>
      <td data-label="Joined">${esc(formatDate(user.created_at))}</td>
      <td data-label="Status">${user.is_banned ? "Banned" : "Active"}${user.is_admin ? " · Admin" : ""}</td>
      <td data-label="" class="cell-actions">
        ${self ? "" : `
          <button class="small" data-ban="${esc(user.id)}" data-banned="${user.is_banned}">
            ${user.is_banned ? "Unban" : "Ban"}</button>
          <button class="small" data-admin="${esc(user.id)}" data-is-admin="${user.is_admin}">
            ${user.is_admin ? "Remove admin" : "Make admin"}</button>`}
        ${total ? `<button class="small danger" data-purge="${esc(user.id)}">Delete ratings</button>` : ""}
      </td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="empty">No users yet.</td></tr>`;
}

usersBody.addEventListener("click", async (event) => {
  const ban = event.target.closest("[data-ban]");
  const admin = event.target.closest("[data-admin]");
  const purge = event.target.closest("[data-purge]");
  const button = ban || admin || purge;
  if (!button) return;
  button.disabled = true;

  let error = null;
  if (ban) {
    ({ error } = await supabase.from("profiles")
      .update({ is_banned: ban.dataset.banned !== "true" }).eq("id", ban.dataset.ban));
  } else if (admin) {
    const promoting = admin.dataset.isAdmin !== "true";
    if (!promoting && !confirm("Remove admin rights from this user?")) {
      button.disabled = false;
      return;
    }
    ({ error } = await supabase.from("profiles")
      .update({ is_admin: promoting }).eq("id", admin.dataset.admin));
  } else if (purge) {
    if (!confirm("Delete every rating and photo from this user? This cannot be undone.")) {
      button.disabled = false;
      return;
    }
    const userId = purge.dataset.purge;
    const { data: rows } = await supabase.from("reviews").select("photos, review_meals(photos)").eq("user_id", userId);
    ({ error } = await supabase.from("reviews").delete().eq("user_id", userId));
    const photos = (rows || []).flatMap(reportPhotoPaths);
    if (!error && photos.length) await supabase.storage.from(PHOTO_BUCKET).remove(photos);
  }

  if (error) {
    notify(msg, error.message, "error");
    button.disabled = false;
    return;
  }
  notify(msg, "Done.", "ok");
  await Promise.all([loadUsers(), loadReviews()]);
});
