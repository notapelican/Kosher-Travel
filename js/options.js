// Suggestion lists. These only power the datalists / dropdowns — reviewers can
// always type something that is not on the list.

export const AIRLINES = [
  "Aer Lingus", "Aeroflot", "Aeromexico", "Air Canada", "Air China", "Air France",
  "Air India", "Air New Zealand", "Alaska Airlines", "Alitalia / ITA Airways",
  "American Airlines", "Arkia", "Austrian Airlines", "Avianca", "Azerbaijan Airlines",
  "British Airways", "Brussels Airlines", "Cathay Pacific", "Copa Airlines",
  "Delta Air Lines", "easyJet", "EgyptAir", "El Al", "Emirates", "Ethiopian Airlines",
  "Etihad Airways", "Finnair", "Iberia", "Icelandair", "Israir", "JetBlue",
  "Japan Airlines", "KLM", "Korean Air", "LATAM", "LOT Polish Airlines", "Lufthansa",
  "Norwegian", "Qantas", "Qatar Airways", "Royal Air Maroc", "Royal Jordanian",
  "Ryanair", "SAS", "Saudia", "Singapore Airlines", "South African Airways",
  "Southwest Airlines", "Spirit Airlines", "Swiss", "TAP Air Portugal", "Turkish Airlines",
  "United Airlines", "Virgin Atlantic", "WestJet", "Wizz Air"
];

export const HECHSHERIM = [
  "Badatz Beit Yosef", "Badatz Eida HaChareidis", "Badatz Igud Rabbanim",
  "Bais Din Tzedek Yerushalayim", "Belz Machzikei Hadass", "BD Rabbanut Israel",
  "CRC (Chicago Rabbinical Council)", "COR (Kashruth Council of Canada)",
  "Chug Chatam Sofer", "Hisachdus HaRabbonim (CRC / Hisachdus)", "KLBD (London Beth Din)",
  "Kehilla Kosher (Los Angeles)", "Kof-K", "Machpud / Yoreh Deah", "MK (Montreal Kosher)",
  "OK Kosher", "OU (Orthodox Union)", "Rabbanut Israel", "Rabbi Landau (Bnei Brak)",
  "Sheerit Yisroel", "Star-K", "Tablet-K", "Volover Rov", "Other", "Unmarked / unknown"
];

export const MEAL_TYPES = [
  "Breakfast", "Brunch", "Lunch", "Dinner", "Light meal", "Snack / cold plate",
  "Sandwich", "Dessert only", "Kids meal"
];

export const CABIN_CLASSES = ["Economy", "Premium economy", "Business", "First"];

// The two optional "how does this airline treat Jewish travelers" scores.
// One definition, used by the form, the review cards and the airline table.
export const EXPERIENCE_SCORES = [
  {
    key: "respect_score",
    label: "Respect for Jewish passengers",
    short: "Respect",
    help: "Courtesy and basic decency toward visibly Jewish passengers — 5 = treated normally and warmly, 1 = hostility or an antisemitic incident.",
    scale: {
      5: "Warm, entirely normal treatment",
      4: "Polite, no issues",
      3: "Indifferent",
      2: "Cold or dismissive",
      1: "Hostile / antisemitic incident"
    }
  },
  {
    key: "kosher_care_score",
    label: "Kosher & observance handling",
    short: "Kosher care",
    help: "Did they get the kosher meal right and take religious practice in stride — davening, tefillin, bringing your own food, a seat change?",
    scale: {
      5: "Knew exactly what to do",
      4: "Handled it well",
      3: "Managed, with some confusion",
      2: "Confused or unhelpful",
      1: "No idea, or made it difficult"
    }
  }
];
