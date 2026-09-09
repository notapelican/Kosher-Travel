import {
  supabase, isConfigured, renderHeader, renderSetupWarning,
  openAuthDialog, reviewCard, enablePhotoLightbox, notify, PHOTO_BUCKET, $
} from "./app.js";

const list = $("#reviews");
const msg = $("#list-msg");
let profile = null;

enablePhotoLightbox(list);
init();

async function init() {
  profile = await renderHeader("mine.html");
  if (!isConfigured) return renderSetupWarning();

  if (!profile) {
    list.innerHTML = `<div class="empty">Sign in to see your ratings.</div>`;
    openAuthDialog();
    return;
  }

  $("#name-card").hidden = false;
  $("#display_name").value = profile.display_name || "";
  $("#name-form").addEventListener("submit", saveName);

  if (new URLSearchParams(location.search).get("saved")) {
    notify(msg, "Rating updated.", "ok");
  }
  await load();
}

async function saveName(event) {
  event.preventDefault();
  const display_name = $("#display_name").value.trim();
  const { error } = await supabase.from("profiles").update({ display_name }).eq("id", profile.id);
  notify(msg, error ? error.message : "Name saved.", error ? "error" : "ok");
  if (!error) {
    profile.display_name = display_name;
    await renderHeader("mine.html");
  }
}

async function load() {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  if (error) return notify(msg, error.message, "error");

  list.innerHTML = data.length
    ? data.map((review) => reviewCard(review, {
        actions: `<a class="btn small" href="submit.html?edit=${review.id}">Edit</a>
                  <button class="small danger" data-delete="${review.id}">Delete</button>`
      })).join("")
    : `<div class="empty">Nothing yet. <a href="submit.html">Rate your first meal.</a></div>`;
}

list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  const id = button.dataset.delete;
  if (!confirm("Delete this rating? This cannot be undone.")) return;

  button.disabled = true;
  const { data: row } = await supabase.from("reviews").select("photos").eq("id", id).maybeSingle();
  const { error } = await supabase.from("reviews").delete().eq("id", id);
  if (error) {
    button.disabled = false;
    return notify(msg, error.message, "error");
  }
  if (row?.photos?.length) await supabase.storage.from(PHOTO_BUCKET).remove(row.photos);
  notify(msg, "Rating deleted.", "ok");
  await load();
});
