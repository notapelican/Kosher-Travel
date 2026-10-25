// flight-lookup: does this flight exist, and what is it?
//
// POST { "flight": "LY 26" }  ->  { found: true, flight: {...}, cached: bool }
//                                  { found: false, reason: "..." }
//
// Checks the flights table first; only an unknown or stale flight number costs
// a call to the provider (AeroDataBox via RapidAPI). Writes go through the
// service role, which is why this runs here and not in the browser. The key
// never leaves the function.

import { createClient } from "npm:@supabase/supabase-js@2";

const CACHE_DAYS = 14;        // re-check a flight after this long
const PROVIDER = "aerodatabox";
const HOST = "aerodatabox.p.rapidapi.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** "LY 26", "ly026", "LY-26" -> { iata: "LY", number: "26" } */
function parseFlight(raw: unknown) {
  const m = String(raw ?? "").trim().toUpperCase().match(/^([A-Z0-9]{2})[\s-]*0*(\d{1,4})$/);
  return m ? { iata: m[1], number: m[2] } : null;
}

type Row = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST a JSON body like {\"flight\":\"LY 26\"}" }, 405);

  const body = await req.json().catch(() => ({}));
  const parsed = parseFlight(body.flight);
  if (!parsed) return json({ found: false, reason: "That does not look like a flight number (e.g. LY 26)." });
  const { iata, number } = parsed;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1. cache
  const { data: cached } = await admin.from("flights").select("*")
    .eq("airline_iata", iata).eq("number", number).maybeSingle();
  if (cached && Date.now() - Date.parse(cached.checked_at) < CACHE_DAYS * 86400e3) {
    return json(cached.found
      ? { found: true, cached: true, flight: publicShape(cached) }
      : { found: false, cached: true, reason: "No airline flies that number at the moment." });
  }

  // 2. provider
  const key = Deno.env.get("RAPIDAPI_KEY");
  if (!key) return json({ error: "Flight lookup is not configured yet (RAPIDAPI_KEY missing)." }, 503);

  const url = `https://${HOST}/flights/number/${iata}${number}?withAircraftImage=false&withLocation=false`;
  const r = await fetch(url, { headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST } });

  let flights: Row[] = [];
  if (r.status === 200) {
    const data = await r.json().catch(() => []);
    flights = Array.isArray(data) ? data : [];
  } else if (r.status !== 204 && r.status !== 404) {
    return json({ error: `Flight data provider returned ${r.status}.` }, 502);
  }

  // Passenger flights only; prefer the most recent departure the provider lists.
  const candidates = flights.filter((f) => !(f as Row).isCargo);
  candidates.sort((a, b) => depTime(b) - depTime(a));
  const best = candidates[0];

  // Make sure the airline row exists so the flight row can reference it.
  const { data: airlineRow } = await admin.from("airlines").select("iata, name").eq("iata", iata).maybeSingle();
  if (!best) {
    if (airlineRow) {
      // Cache the miss so repeated searches for a dead number stay free.
      await admin.from("flights").upsert(
        { airline_iata: iata, number, found: false, checked_at: new Date().toISOString(), source: PROVIDER },
        { onConflict: "airline_iata,number" });
    }
    return json({ found: false, reason: airlineRow
      ? `${airlineRow.name} does not seem to fly a flight ${number} at the moment.`
      : `No airline with code ${iata} flies a flight ${number} at the moment.` });
  }

  const al = (best.airline ?? {}) as Row;
  if (!airlineRow) {
    await admin.from("airlines").upsert(
      { iata, icao: al.icao ?? null, name: (al.name as string) || iata },
      { onConflict: "iata", ignoreDuplicates: true });
  }
  const isOperator = best.codeshareStatus === "IsOperator" || best.codeshareStatus == null;
  const lastSeen = depTime(best) ? new Date(depTime(best)).toISOString() : new Date().toISOString();
  const record = {
    airline_iata: iata,
    number,
    found: true,
    origin_iata: pick(best, "departure", "airport", "iata"),
    destination_iata: pick(best, "arrival", "airport", "iata"),
    operating_iata: isOperator ? iata : null,
    codeshare: !isOperator,
    aircraft: pick(best, "aircraft", "model"),
    last_seen: lastSeen,
    checked_at: new Date().toISOString(),
    source: PROVIDER
  };
  const { data: saved, error } = await admin.from("flights")
    .upsert(record, { onConflict: "airline_iata,number" }).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ found: true, cached: false, flight: publicShape(saved) });
});

function pick(o: Row, ...path: string[]): string | null {
  let cur: unknown = o;
  for (const k of path) { if (cur == null || typeof cur !== "object") return null; cur = (cur as Row)[k]; }
  return typeof cur === "string" && cur ? cur : null;
}
function depTime(f: Row): number {
  const d = (f.departure ?? {}) as Row;
  const t = ((d.scheduledTime ?? {}) as Row).utc ?? d.scheduledTimeUtc ?? ((d.scheduledTime ?? {}) as Row).local;
  const n = typeof t === "string" ? Date.parse(t) : NaN;
  return Number.isFinite(n) ? n : 0;
}
function publicShape(row: Row) {
  const { id, airline_iata, number, origin_iata, destination_iata, operating_iata, codeshare, aircraft, last_seen } = row;
  return { id, airline_iata, number, origin_iata, destination_iata, operating_iata, codeshare, aircraft, last_seen };
}
