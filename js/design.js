// The design presets an admin can switch between, and how a choice is applied.
//
// A preset is three independent settings:
//   skin     colors, type, radii and the hero composition   (CSS: html[data-skin])
//   reports  how review cards lay out                        (CSS: html[data-reports])
//   airlines how the "airlines on this route" block renders  (JS picks the renderer)
//
// The chosen design lives in site_settings (key "design") so it applies to
// everyone; it is also cached in localStorage so a returning visitor's first
// paint already uses it. Nothing here touches the network: app.js loads the
// setting and calls applyDesign().

export const PRESETS = {
  current: {
    label: "Current site",
    blurb: "The teal design the site launched with.",
    skin: "current", reports: "cards", airlines: "bars"
  },
  board: {
    label: "A · The Board",
    blurb: "Departures board: condensed uppercase, amber, flap-digit scores, one table.",
    skin: "board", reports: "strip", airlines: "table"
  },
  night: {
    label: "B · Night Flight",
    blurb: "The cabin at night: light serif, one amber, reports in a single column.",
    skin: "night", reports: "list", airlines: "tiles"
  },
  cabin: {
    label: "C · Board in the Cabin",
    blurb: "A's table inside a light cabin with an oval window and rounded controls.",
    skin: "cabin", reports: "grid", airlines: "table"
  },
  window: {
    label: "D · Window Seat",
    blurb: "The same cabin with photo cards and score bars instead of a table.",
    skin: "cabin", reports: "grid", airlines: "bars"
  }
};

export const DEFAULT_DESIGN = { preset: "current", ...PRESETS.current };

/** Google Fonts each skin needs. The current skin uses system fonts. */
export const SKIN_FONTS = {
  board: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap",
  night: "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,300;8..60,600&family=Karla:wght@400;500;700&display=swap",
  cabin: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,800&family=IBM+Plex+Mono:wght@400;600&display=swap"
};

const STORAGE_KEY = "kt-design";

/** Accepts a stored value of any vintage and returns a complete design. */
export function normalizeDesign(value) {
  const preset = PRESETS[value?.preset] ? value.preset : null;
  const base = preset ? PRESETS[preset] : PRESETS.current;
  const pick = (key, allowed) => (allowed.includes(value?.[key]) ? value[key] : base[key]);
  return {
    preset: preset || "current",
    skin: pick("skin", ["current", "board", "night", "cabin"]),
    reports: pick("reports", ["cards", "grid", "strip", "list"]),
    airlines: pick("airlines", ["table", "tiles", "bars"])
  };
}

export function cachedDesign() {
  try { return normalizeDesign(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return { ...DEFAULT_DESIGN }; }
}

/** Sets the root attributes, loads the skin's fonts, remembers the choice. */
export function applyDesign(value) {
  const design = normalizeDesign(value);
  const root = document.documentElement;
  const changed = root.dataset.skin !== design.skin
    || root.dataset.reports !== design.reports
    || root.dataset.airlines !== design.airlines;
  root.dataset.skin = design.skin;
  root.dataset.reports = design.reports;
  root.dataset.airlines = design.airlines;
  root.dataset.preset = design.preset;
  ensureFonts(design.skin);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...design, fonts: SKIN_FONTS[design.skin] || "" })); } catch {}
  if (changed) document.dispatchEvent(new CustomEvent("design-change", { detail: design }));
  return design;
}

function ensureFonts(skin) {
  const href = SKIN_FONTS[skin];
  if (!href || document.querySelector(`link[data-skin-fonts="${skin}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.skinFonts = skin;
  document.head.append(link);
}

export function currentDesign() {
  const d = document.documentElement.dataset;
  return normalizeDesign({ preset: d.preset, skin: d.skin, reports: d.reports, airlines: d.airlines });
}
