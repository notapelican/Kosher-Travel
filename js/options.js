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
  "Agudas Achim Zurich (Switzerland)",
  "Ajdut Kosher (Argentina)",
  "Badatz Beit Yosef",
  "Badatz Eida HaChareidis",
  "Badatz Igud Rabbanim",
  "Badatz Yerushalayim (Israel)",
  "Bais Din Tzedek Yerushalayim",
  "BD Rabbanut Israel",
  "Belz Machzikei Hadass",
  "Beth Din of Lyon (France)",
  "Chug Chatam Sofer",
  "Consistoire de Paris (France)",
  "COR (Kashruth Council of Canada)",
  "CRC (Chicago Rabbinical Council)",
  "Emirates Agency for Kosher Certificate – EAKC (United Arab Emirates)",
  "Harabanut Lekashrut Artzit (Israel)",
  "Hisachdus HaRabbonim (CRC / Hisachdus)",
  "Japan Kosher Service (Japan)",
  "Jewish Assoc. of the Philippines – JKS (Philippines)",
  "Kashrut Authority – KA (Australia & NZ)",
  "Kedassia – Eida Hachareidis (United Kingdom)",
  "Kehilla Kosher (Los Angeles)",
  "KLBD (London Beth Din)",
  "Kof-K",
  "Kosher Kiwi (New Zealand)",
  "Kosher SA (South Africa)",
  "Machpud / Yoreh Deah",
  "MK (Montreal Kosher)",
  "OK Kosher",
  "OU (Orthodox Union)",
  "Rabbanut Israel",
  "Rabbi Landau (Bnei Brak)",
  "Rabbi Rabinowitz – Biala (Israel)",
  "Rabbinate Amsterdam (Netherlands)",
  "Sheerit Yisroel",
  "Star-K",
  "Tablet-K",
  "Vaad Hakashrus Vienna – BDZ (Austria)",
  "Volover Rov",
  "Other", "Unmarked / unknown"
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

// Meal caterers to suggest. The form also suggests every caterer already on
// the site, so this only needs the common ones; anything can be typed.
export const CATERERS = ["Lewis'", "Regal"];

// Diets a meal can be marked as suitable for. Each has a 24×24 line icon
// drawn with currentColor. The keys are also checked by the database
// (review_meals_diets_check in supabase/schema.sql): add a key there too.
const NO = "M4 4l16 16";                     // the strike-through on the "free of" icons
export const DIETS = [
  { key: "vegetarian", label: "Vegetarian",
    icon: "M5 19C5 10 10 5 19 5c0 9-5 14-14 14z M5 19l8-8" },
  { key: "vegan", label: "Vegan",
    icon: "M12 21v-8 M12 13C12 9 9.5 7 5 7c0 4 2.5 6 7 6z M12 11c0-4 2.5-6 7-6 0 4-2.5 6-7 6z" },
  { key: "gluten_free", label: "Gluten free",
    icon: `M12 21V7 M12 7c-1.8-.9-2.8-2.4-2.8-4.2 1.8.9 2.8 2.4 2.8 4.2zm0 0c1.8-.9 2.8-2.4 2.8-4.2-1.8.9-2.8 2.4-2.8 4.2z M12 12c-2-1-3.2-2.6-3.2-4.4 2 .8 3.2 2.4 3.2 4.4zm0 0c2-1 3.2-2.6 3.2-4.4-2 .8-3.2 2.4-3.2 4.4z M12 17c-2-1-3.2-2.6-3.2-4.4 2 .8 3.2 2.4 3.2 4.4zm0 0c2-1 3.2-2.6 3.2-4.4-2 .8-3.2 2.4-3.2 4.4z ${NO}` },
  { key: "coeliac", label: "Coeliac safe",
    icon: "M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z M9 12l2 2 4-4.5" },
  { key: "peanut_free", label: "Peanut free",
    icon: `M10.5 4.5a4 4 0 00-3.2 6.4c.5.7.5 1.5 0 2.2a4 4 0 106.6 4.4c.4-.7 1.1-1 1.9-1a4 4 0 10-1.2-7.8c-.8.2-1.6-.1-2-.8a4 4 0 00-2.1-3.4z ${NO}` },
  { key: "nut_free", label: "Tree-nut free",
    icon: `M5 10.5h14c0-3-3.1-5-7-5s-7 2-7 5z M12 5.5V3 M6.5 10.5c0 5 2.6 8.6 5.5 10 2.9-1.4 5.5-5 5.5-10 ${NO}` },
  { key: "dairy_free", label: "Dairy free",
    icon: `M9 3h6 M9.5 3v3.2L7 10v11h10V10l-2.5-3.8V3 M7 13h10 ${NO}` },
  { key: "egg_free", label: "Egg free",
    icon: `M12 3c-3.6 0-6.5 6-6.5 10.5a6.5 6.5 0 0013 0C18.5 9 15.6 3 12 3z ${NO}` },
  { key: "sesame_free", label: "Sesame free",
    icon: `M8 5.5c1.6 1 2 3 1 4.6-1.6-1-2-3-1-4.6z M15.5 5c1.2 1.4 1 3.4-.5 4.6-1.2-1.4-1-3.4.5-4.6z M11.5 13c1.6.6 2.4 2.5 1.8 4.2-1.6-.6-2.4-2.5-1.8-4.2z M6 15.5c1.8 0 3.2 1.4 3.2 3.2-1.8 0-3.2-1.4-3.2-3.2z M16.5 13.5c1.4 1.1 1.6 3.1.5 4.6-1.4-1.1-1.6-3.1-.5-4.6z ${NO}` },
  { key: "diabetic", label: "Diabetic friendly",
    icon: "M12 3c3 4 6 7.6 6 11a6 6 0 01-12 0c0-3.4 3-7 6-11z M9.5 14.5h5" }
];

export function dietIcon(key, { size = 18 } = {}) {
  const diet = DIETS.find((d) => d.key === key);
  if (!diet) return "";
  return `<svg class="diet-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true"><path d="${diet.icon}"/></svg>`;
}
