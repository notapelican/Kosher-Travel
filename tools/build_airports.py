"""Builds data/airports.json, the list of airports the site accepts.

Source: OurAirports (https://ourairports.com/data/), public domain. Download
airports.csv and countries.csv from
https://github.com/davidmegginson/ourairports-data and run:

    python3 tools/build_airports.py path/to/airports.csv path/to/countries.csv

Kept: every large or medium airport with an IATA code, plus small airports
with scheduled airline service. Heliports, seaplane bases and closed fields
are left out.
"""
import csv
import json
import re
import sys
import unicodedata

# OurAirports gives the municipality an airport sits in, which for many hubs
# is a suburb nobody would type ("Ferno" for Milan Malpensa). These are the
# names travelers use.
CITY = {
    "CDG": "Paris", "ORY": "Paris", "MXP": "Milan", "LIN": "Milan", "BGY": "Milan",
    "IAD": "Washington", "STN": "London", "LTN": "London", "SEN": "London",
    "TPE": "Taipei", "ATH": "Athens", "OTP": "Bucharest", "SAW": "Istanbul",
    "KBP": "Kyiv", "PTY": "Panama City", "DWC": "Dubai", "NRT": "Tokyo",
    "KRK": "Kraków", "EDI": "Edinburgh", "LYS": "Lyon", "MRS": "Marseille",
    "NGO": "Nagoya", "KUL": "Kuala Lumpur", "ZAG": "Zagreb", "LJU": "Ljubljana",
    "ADB": "Izmir", "SKP": "Skopje", "MVD": "Montevideo", "VVO": "Vladivostok",
    "MFM": "Macau", "DPS": "Bali", "TRN": "Turin", "VRN": "Verona",
    "GRZ": "Graz", "ISB": "Islamabad", "BRU": "Brussels", "CGN": "Cologne",
    "FLR": "Florence", "VCE": "Venice", "NAP": "Naples", "TIA": "Tirana",
    "ECN": "Nicosia", "CFU": "Corfu", "DMM": "Dammam", "GIG": "Rio de Janeiro",
    "BOG": "Bogotá", "LLW": "Lilongwe", "WMI": "Warsaw", "NYO": "Stockholm",
    "HHN": "Frankfurt", "CIA": "Rome", "AEP": "Buenos Aires", "EZE": "Buenos Aires",
    "MLA": "Malta",
}

# The main airport of a city with several, listed first when you type the city.
HUBS = {
    "LHR", "JFK", "CDG", "HND", "MXP", "FCO", "SVO", "IST", "ORD", "IAD", "IAH",
    "GRU", "EZE", "ICN", "PEK", "PVG", "KIX", "DXB", "BKK", "BER", "ARN", "GIG",
    "CGK", "TPE", "KBP", "IKA", "DFW", "YUL", "YYZ", "LAX", "MIA", "SFO", "BOS",
    "EWR", "TLV", "MEX", "BOM", "DEL", "SYD", "MEL", "JNB", "CPT", "AMS", "FRA",
    "MUC", "ZRH", "VIE", "MAD", "BCN", "LIS", "ATH", "WAW", "BUD", "PRG",
}

def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", text)
                   if unicodedata.category(c) != "Mn").lower()

def clean_city(municipality, name):
    # "Paris (Roissy-en-France, Val-d'Oise)" -> "Paris"; "London, Essex" -> "London"
    city = re.sub(r"\s*\(.*?\)\s*", " ", municipality).strip()
    city = re.split(r"\s*[,/]\s*", city)[0].strip()
    return city or name

def main(airports_csv, countries_csv, out="data/airports.json"):
    countries = {r["code"]: r["name"] for r in csv.DictReader(open(countries_csv, encoding="utf-8"))}
    rows = []
    for r in csv.DictReader(open(airports_csv, encoding="utf-8")):
        iata = r["iata_code"].strip().upper()
        if not re.fullmatch(r"[A-Z]{3}", iata):
            continue
        kind = r["type"]
        if kind not in ("large_airport", "medium_airport", "small_airport"):
            continue
        if kind == "small_airport" and r["scheduled_service"] != "yes":
            continue
        city = CITY.get(iata) or clean_city(r["municipality"], r["name"])
        assert "(" not in city, city   # the site writes airports as "City (IATA)"
        # extra words a traveler might search by: the raw municipality and
        # Latin-script keywords ("Tokyo" for Narita, "Ben Gurion")
        extra = " ".join(w for w in [r["municipality"], r["keywords"]]
                         if w and fold(w) not in fold(city + " " + r["name"]))
        extra = " ".join(t for t in re.split(r"[,;]\s*", extra) if t and all(ord(c) < 0x250 for c in t))
        rank = -1 if iata in HUBS else {"large_airport": 0, "medium_airport": 1, "small_airport": 2}[kind]
        rows.append([iata, city, r["name"], r["iso_country"], rank, fold(extra)[:90]])
    rows.sort(key=lambda a: (a[4], a[0]))
    used = sorted({a[3] for a in rows})
    data = {
        "source": "OurAirports (public domain), built by tools/build_airports.py",
        "countries": {c: countries.get(c, c) for c in used},
        "fields": ["iata", "city", "name", "country", "rank", "search"],
        "airports": rows,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rows)} airports in {len(used)} countries -> {out}")

if __name__ == "__main__":
    main(*sys.argv[1:3])
