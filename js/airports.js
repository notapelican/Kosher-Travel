// Airport autocomplete. The list is data/airports.json (built from OurAirports
// by tools/build_airports.py) and loads the first time an airport field is used.
//
// An airport is written into a field as "City (IATA)", e.g. "New York (JFK)",
// which is also how it is stored on a report. A strict field accepts nothing
// else: free text that is not an airport makes the field invalid, so the form
// will not submit. A loose field (the search strip) suggests airports but
// still lets you search any text.

import { esc } from "./app.js";

let loading = null;
let loadFailed = false;       // the list could not be fetched: fields fall back to plain text
let airports = [];            // [{ iata, city, name, country, size, hay, cityKey }]
let byCode = new Map();

export function loadAirports() {
  if (!loading) {
    loading = fetch("data/airports.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`airports ${r.status}`))))
      .then((data) => {
        airports = data.airports.map(([iata, city, name, cc, size, search]) => {
          const country = data.countries[cc] || cc;
          return {
            iata, city, name, country, size,
            cityKey: fold(city),
            nameKey: fold(name),
            hay: fold(`${iata} ${city} ${name} ${country} ${search}`)
          };
        });
        byCode = new Map(airports.map((a) => [a.iata, a]));
        return airports;
      })
      .catch((error) => { loading = null; loadFailed = true; throw error; });
  }
  return loading;
}

function fold(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function airportLabel(a) {
  return a ? `${a.city} (${a.iata})` : "";
}

export function airportByCode(code) {
  return byCode.get(String(code || "").toUpperCase()) || null;
}

/**
 * The airport a typed value means, or null. Accepts "City (IATA)", a bare
 * IATA code, or a city name with only one airport ("Tel Aviv").
 */
export function resolveAirport(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  // the code is the precise part: "Newark (EWR)" and "New York (EWR)" both mean Newark
  const tail = value.match(/\(([A-Za-z]{3})\)\s*$/);
  if (tail) return airportByCode(tail[1]);
  // A bare code counts when typed in capitals, or when it is also the best
  // match: "jfk" is JFK, but "new" is the start of New York, not New Orleans
  // Lakefront (NEW), and "los" is not Lagos.
  if (/^[A-Za-z]{3}$/.test(value)) {
    const hit = airportByCode(value);
    if (hit && (/^[A-Z]{3}$/.test(value) || searchAirports(value, 1)[0] === hit)) return hit;
  }
  const key = fold(value);
  const same = airports.filter((a) => a.cityKey === key || a.nameKey === key);
  return same.length === 1 ? same[0] : null;
}

/** Best matches for what has been typed so far. */
export function searchAirports(query, limit = 8) {
  const q = fold(query).replace(/\(([a-z]{3})\)$/, "$1");
  if (!q) return [];
  const typedCode = /^[A-Z]{3}$/.test(String(query).trim());
  const words = q.split(/\s+/);
  const scored = [];
  for (const a of airports) {
    if (!words.every((w) => a.hay.includes(w))) continue;
    let score = 6;
    // a lowercase code ranks with city names, just behind them: "mia" is
    // Miami International, "los" is Los Angeles before Lagos (LOS)
    if (a.iata.toLowerCase() === q) score = typedCode ? 0 : 2.05;
    else if (a.cityKey === q) score = 1;
    else if (a.cityKey.startsWith(q)) score = 2;
    else if (a.nameKey.startsWith(q) || a.nameKey.includes(` ${q}`)) score = 3;
    else if (a.cityKey.includes(q) || a.nameKey.includes(q)) score = 4;
    scored.push([score * 10 + a.size, a]);
  }
  scored.sort((x, y) => x[0] - y[0] || x[1].city.localeCompare(y[1].city));
  return scored.slice(0, limit).map(([, a]) => a);
}

let uid = 0;

/**
 * Turns a text input into an airport combobox.
 *   strict      only airports are accepted (the field is invalid otherwise)
 *   fill        "label" writes "City (IATA)"; "code" writes just the IATA code
 *   suggest()   airport codes to offer while the field is empty
 *   onPick(a)   called with the airport, or null when the field is cleared
 */
export function airportPicker(input, { strict = false, fill = "label", suggest = null, onPick = null } = {}) {
  const id = `ap-list-${++uid}`;
  const list = document.createElement("ul");
  list.id = id;
  list.className = "ap-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  document.body.append(list);

  const error = document.createElement("span");
  error.className = "hint ap-error";
  error.hidden = true;
  input.insertAdjacentElement("afterend", error);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", id);
  input.setAttribute("aria-expanded", "false");
  input.autocomplete = "off";
  input.spellcheck = false;

  let options = [];
  let active = -1;
  let picked = null;

  const write = (a) => (fill === "code" ? a.iata : airportLabel(a));

  function place() {
    const r = input.getBoundingClientRect();
    const viewport = window.visualViewport?.height ?? window.innerHeight;
    const below = viewport - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 180 && above > below;
    list.style.left = `${r.left + window.scrollX}px`;
    list.style.width = `${Math.max(r.width, 260)}px`;
    list.style.maxHeight = `${Math.max(140, Math.min(340, up ? above : below))}px`;
    list.style.top = up ? "" : `${r.bottom + window.scrollY + 4}px`;
    list.style.bottom = up ? `${document.documentElement.clientHeight - r.top - window.scrollY + 4}px` : "";
    list.classList.toggle("up", up);
  }

  function open(items, heading = "") {
    options = items;
    active = items.length ? 0 : -1;
    if (!items.length) return close();
    list.innerHTML = (heading ? `<li class="ap-head" role="presentation">${esc(heading)}</li>` : "") + items.map((a, i) => `
      <li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${i === active}">
        <span class="ap-main"><b>${esc(a.city)}</b><span class="ap-code">${esc(a.iata)}</span></span>
        <span class="ap-sub">${esc(a.name)} · ${esc(a.country)}</span>
      </li>`).join("");
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-activedescendant", `${id}-${active}`);
    place();
  }

  function close() {
    list.hidden = true;
    options = [];
    active = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function move(step) {
    if (!options.length) return;
    active = (active + step + options.length) % options.length;
    for (const li of list.querySelectorAll("[role=option]")) li.setAttribute("aria-selected", String(Number(li.dataset.i) === active));
    input.setAttribute("aria-activedescendant", `${id}-${active}`);
    list.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function choose(a) {
    picked = a;
    input.value = write(a);
    input.dataset.iata = a.iata;
    setError("");
    close();
    onPick?.(a);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setError(message) {
    if (strict) input.setCustomValidity(message);
    error.textContent = message;
    error.hidden = !message;
    input.toggleAttribute("aria-invalid", Boolean(message));
  }

  /**
   * Checks the typed value. With show (on leaving the field, or submitting)
   * it also tidies the value to "City (IATA)" and puts any problem on
   * screen; while typing it only updates whether the field is valid.
   */
  function check(show) {
    const value = input.value.trim();
    if (!value) {
      picked = null;
      delete input.dataset.iata;
      setError("");
      return true;
    }
    if (picked && value === write(picked)) return true;
    if (!airports.length && loadFailed) { setError(""); return true; }
    const hit = airports.length ? resolveAirport(value) : null;
    if (hit) {
      picked = hit;
      if (show) input.value = write(hit);
      input.dataset.iata = hit.iata;
      setError("");
      return true;
    }
    picked = null;
    delete input.dataset.iata;
    if (!strict) return true;
    const several = airports.filter((a) => a.cityKey === fold(value)).length;
    const message = !airports.length
      ? "Airports are still loading. Try again in a moment."
      : several > 1
        ? `${value} has ${several} airports. Pick yours from the list.`
        : "Pick an airport from the list. Type a city, an airport name or its three-letter code.";
    if (show) setError(message);
    else input.setCustomValidity(message);
    return false;
  }

  async function refresh() {
    try { await loadAirports(); } catch { return; }   // without the list, the field just stays a text box
    const value = input.value.trim();
    if (!value) {
      const codes = (suggest?.() || []).map(airportByCode).filter(Boolean);
      return codes.length ? open(codes, "From your flight") : close();
    }
    open(searchAirports(value));
  }

  input.addEventListener("focus", () => { refresh(); });
  input.addEventListener("input", () => {
    if (!error.hidden) setError("");
    check(false);
    refresh();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) refresh(); else move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && !list.hidden && active >= 0) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Tab" && !list.hidden && active >= 0 && input.value.trim()) {
      choose(options[active]);
    } else if (event.key === "Escape" && !list.hidden) {
      event.preventDefault();
      close();
    }
  });
  input.addEventListener("blur", () => { close(); check(true); });
  input.addEventListener("invalid", () => { check(true); });
  // mousedown, not click: picking must happen before the input loses focus
  list.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const li = event.target.closest("[role=option]");
    if (li) choose(options[Number(li.dataset.i)]);
  });
  window.addEventListener("resize", () => { if (!list.hidden) place(); });
  window.visualViewport?.addEventListener("resize", () => { if (!list.hidden) place(); });

  // a value already in the field (editing, or a link) is checked once the list arrives
  loadAirports().then(() => check(Boolean(input.value.trim()))).catch(() => {});

  return {
    /** Sets the field to an airport by code; returns false if the code is unknown. */
    async setCode(code) {
      await loadAirports().catch(() => {});
      const a = airportByCode(code);
      if (!a) return false;
      picked = a;
      input.value = write(a);
      input.dataset.iata = a.iata;
      setError("");
      return true;
    },
    /** Re-checks the field once the list is in, e.g. after filling it in code. */
    async recheck() {
      await loadAirports().catch(() => {});
      return check(true);
    },
    /** "City (IATA)" for the airport in the field, or null. */
    label: () => (picked ? airportLabel(picked) : null)
  };
}
