# Kosher Travel

A site where travelers rate kosher inflight meals — airline, flight number, the city the
meal was loaded in, the hechsher on the seal, a 1–5 score, notes and photos. Reviewers can
also report, optionally, how the airline treated them as a Jewish traveler, and can sign a
rating with a display name or post it anonymously.

Everything runs on free tiers: the site itself is static files served by **GitHub Pages**,
and accounts, data and photos live in a free **Supabase** project. There is no build step
and nothing to install.

```
index.html      browse + search all ratings
airlines.html   every airline, with logo and averages: meal, respect, kosher handling
submit.html     post a rating (also used to edit one, ?edit=<id>)
mine.html       your own ratings + display name
admin.html      admin dashboard: hide/edit/delete ratings, ban/promote users
css/styles.css  all styling (light + dark)
css/skins.css   the switchable designs (see "Designs" below)
js/design.js    the design presets and how a choice is applied
js/config.js    <- the only file you have to edit
js/app.js       Supabase client, auth, shared rendering
js/browse.js  js/airlines.js  js/submit.js  js/mine.js  js/admin.js
js/options.js   airline / hechsher / meal lists, and the experience-score wording
supabase/schema.sql       tables, row-level security, storage bucket
supabase/migrations/      changes to apply to an already-deployed database
```

## Designs

The admin page has a **Design** tab that switches the whole site between five looks: the
original teal design and the four redesigns under `design-review/`. A design is three
settings stored together in `site_settings` (key `design`): a **skin** (colors, type, radii and
the hero), a **reports** layout (how review cards lay out) and an **airlines** renderer (how the
"airlines on this route" block is drawn). The presets are defined in
[`js/design.js`](js/design.js); the CSS for each skin is in [`css/skins.css`](css/skins.css),
selected by `data-skin` on `<html>`. The choice is cached in `localStorage` so a returning
visitor's first paint already uses it, then refreshed from the database. Once a design is
chosen for good, the others can be deleted from those two files and nothing else changes.

## Flights and airlines

The home page searches by From, To, flight number, airline and hechsher. Airlines come from the
`airlines` table (seeded with IATA codes; logos from `logo_url` or a public CDN keyed by code,
falling back to the code in a tile). Flight numbers are checked against the `flight-lookup`
Edge Function (setup step 6): a search for a real flight with no reports yet gets a "flown it?
add yours" prompt, a search for a flight that does not exist says so, and the rating form will
not post to a flight the lookup rejects. Validated flights carry their route, operating carrier
and aircraft onto each report.

## What a rating records

A rating is one flight. The form is one always-visible card for the flight, then a
collapsible section per meal, then two more for the experience and the byline. Each collapsed
section still summarizes itself in its header ("★★★★ · 2 photos", "1 of 2 scored ·
written"), so nothing you filled in is hidden from you. A required field can never be trapped
in a closed section: submitting opens all of them first.

**The meals.** Each meal served on the flight gets its own block: which meal it was
(dinner, breakfast, a snack…), a required 1–5 score, the hechsher on the seal, what it
actually was, an optional write-up, and up to four photos of the tray. One block is there to
start; "Add another meal from this flight" adds more, up to six, and any block can be removed
while there is more than one. (Airline and the city the meals were loaded in are required too,
and sit in the flight card above.)

On the site a one-meal report looks the same as it always did. A report with several meals
shows the average of its meal scores in the badge ("3.5/5 · 2 meals") and lists each meal with
its own score underneath; the hechsher filter matches a report if any of its meals carries
that seal. The airlines page averages each report's meal average, so a traveler who ate three
meals counts once, like everyone else.

In the database the flight is a row in `reviews` and each meal a row in `review_meals`.
Reports are written through the `save_report()` function, which saves the flight and its meals
in one transaction under the caller's own row-level security. `reviews_public` returns one row
per report with its meals as JSON, plus the summary columns the list pages filter and sort on.
Reports saved before migration 005 became one-meal reports.

**The travel experience** — how the airline treated you as a Jewish traveler. Entirely
optional, and its scores and its write-up are independent: score both, score neither and just
write, or skip it. Two scores, kept separate because they are different questions:

| Score | What it asks |
| --- | --- |
| **Respect for Jewish passengers** | Courtesy and basic decency toward visibly Jewish passengers. 5 = treated normally and warmly, 1 = hostility or an antisemitic incident. |
| **Kosher & observance handling** | Did they get the kosher meal right and take religious practice in stride — davening, tefillin, bringing your own food, a seat change? |

Both default to "Rather not say" so nobody is pushed into scoring something they did not
observe — a written account with no scores at all is a perfectly good rating, and it is the
part other travelers actually read. `airlines.html` averages each score per airline and shows
how many reports it rests on, since one report is one person's experience.

Both write-ups are searchable from the browse page.

The exact wording of these scores, including each point on the 1–5 scale, lives in
`EXPERIENCE_SCORES` in [`js/options.js`](js/options.js) — change it there and the form, the
review cards and the airline table all follow.

## Bylines and anonymity

Each rating is signed one of two ways, chosen per rating:

- **Under a display name** the reviewer sets on the *My ratings* page. It need not be a real
  name, and leaving it blank shows as "Traveler". Renaming updates the byline on every
  rating they signed.
- **Anonymously**, shown as "Anonymous".

Anonymity is enforced by the database, not just by the page. The public site reads the
`reviews_public` view, which drops the poster's `user_id` on anonymous rows, so an anonymous
rating cannot be matched to the same person's signed ratings even by someone querying the API
directly. Admins can still see who posted what — the form says so plainly — because
moderation is impossible otherwise.

## Setup

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project (free plan, no card).
2. Open **SQL Editor**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and run it.
   That creates the `profiles` and `reviews` tables, the `reviews_public` view, the security
   policies, the table privileges the site needs, and the public `meal-photos` storage bucket.
   It is safe to re-run. When creating the project, tick **Enable Data API**; the
   "Automatically expose new tables" and "automatic RLS" options can stay off, since the schema
   handles both itself.
   If you set the project up before a feature was added, run the matching file in
   [`supabase/migrations/`](supabase/migrations) instead — those are also safe to re-run.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Point the site at it

Edit `js/config.js`:

```js
export const SUPABASE_URL = "https://abcdefgh.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

The anon key is meant to be public — it is safe in a git repo. Every table is guarded by the
row-level security policies in `schema.sql`, so the key alone cannot read hidden ratings,
edit someone else's post, or make anyone an admin. Never commit the *service role* key.

### 3. Turn on sign-in

In Supabase under **Authentication → Providers**:

- **Email** is on by default. The site uses magic links (no passwords to manage).
- **Google**: create an OAuth client in the
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (OAuth client ID →
  Web application) with `https://koshertravel.app` as an **Authorized JavaScript origin** and
  `https://<project-ref>.supabase.co/auth/v1/callback` as an **Authorized redirect URI**. On the
  OAuth consent screen give it the app name and logo and publish it. In Supabase enable the
  Google provider and paste the client ID and secret. Then put the same client ID in
  `js/config.js` as `GOOGLE_CLIENT_ID`: with it set, the Google button is rendered by Google on
  the site itself and the consent screen names `koshertravel.app`; without it, the site falls
  back to a redirect through Supabase, and Google shows the Supabase project address instead.

Then under **Authentication → URL Configuration**, set **Site URL** to `https://koshertravel.app/`
and add it to **Redirect URLs** too, plus `http://localhost:8000/` if you want to develop locally.

### 4. Publish

In this repo: **Settings → Pages → Build and deployment → Deploy from a branch**, choose `main`
and the `/ (root)` folder. The `CNAME` file at the repo root tells GitHub to serve the site at
`https://koshertravel.app/`. At the registrar (Cloudflare), the apex needs four `A` records to
GitHub Pages (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`) and `www` a `CNAME` to
`notapelican.github.io`, both with Cloudflare's proxy **off** (DNS only) so GitHub can issue the
certificate. Then in **Settings → Pages** confirm the custom domain shows a green check and tick
**Enforce HTTPS**. `.app` domains are HTTPS-only by browser policy, so the site will not load
until that certificate exists.

### 5. Make yourself an admin

Sign in on the live site once so your profile row exists, then run this in the Supabase
SQL editor:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

Reload the site and an **Admin** link appears in the header.

### 6. Flight lookup (optional, recommended)

The submit form and the "no reports yet" prompt can check that a flight really exists and pull
its route, operating carrier and aircraft. That needs a data provider key, which must not live
in the browser, so it runs in a small Supabase Edge Function in
[`supabase/functions/flight-lookup/`](supabase/functions/flight-lookup). Results are cached in
the `flights` table, so each flight number costs one provider call ever, then nothing.

1. Sign up for [AeroDataBox on RapidAPI](https://rapidapi.com/aedbx-aedbx/api/aerodatabox)
   (free tier) and copy your RapidAPI key.
2. In Supabase: **Edge Functions → Secrets**, add `RAPIDAPI_KEY` with that value.
3. **Edge Functions → Deploy a new function → Via editor**, name it `flight-lookup`, paste the
   contents of `supabase/functions/flight-lookup/index.ts`, deploy. (Or with the CLI:
   `supabase functions deploy flight-lookup`.)
4. Leave **Verify JWT** on: the site calls the function with the anon key, which is a valid JWT,
   so signed-out visitors can search while random callers cannot.

Without the function the site still works; it just cannot validate flights, and the submit
form falls back to accepting any flight number.

## Logo

The mark is a K whose stem is a fork, three tines at the top, and whose upper arm is a plane
climbing out of the letter: body, wings and nose, with no tail, so the plane is the K's arm
rather than an icon placed beside it. The site is kosher meals in the air, and the mark says
both halves. It is defined once as `LOGO` in [`js/app.js`](js/app.js) and reused for the
header badge and the empty states, as plain inline SVG in `currentColor`, so it inherits
whatever colour it sits on and needs no image file. The favicon is the same mark on the brand
tile as a `data:` URI in each page's `<head>`, beside a `theme-color` for mobile browser chrome.

The earlier mark, a plane seen from above with fork-and-knife wings, read as a cross at
favicon size: straight wings at mid-height make a plus sign. The design review that led to the
current mark, with the alternatives and a slider tuner for it, is under `design-review/logos/`.

## Layout

The CSS is mobile-first: everything before the first `min-width` query *is* the phone layout,
and the three breakpoints only ever add — 600px (large phone), 860px (where the bottom tab bar
gives way to inline nav), 1040px (desktop). Notable phone behavior:

- Navigation is a fixed bottom tab bar with icons; the inline header nav appears from 860px.
- Form fields are 16px, which is what stops iOS Safari from zooming when one is focused, and
  touch targets stay at least 44px — they only compact where a fine pointer is detected.
- The admin and airline tables reflow into stacked, labelled rows instead of scrolling
  sideways (the labels come from `data-label` on each cell).
- `env(safe-area-inset-*)` is respected, so nothing hides behind an iPhone's home indicator
  or notch.
- The sign-in dialog is a bottom sheet on phones and a centered modal from 600px.
- Photo upload is a large tappable drop zone rather than a native file button: the real
  `<input type="file">` is visually hidden and a styled label stands in for it, which is the
  only way to restyle "Choose files". It accepts drag-and-drop on desktop, and reports how
  many photos are attached and how many more will fit.

## Testing the security rules

The row-level security policies are the whole defense, so they have tests that run against a
throwaway local Postgres — no Supabase account needed. See
[`supabase/tests/README.md`](supabase/tests/README.md).

## Running locally

Because the pages use ES modules, open them through a server rather than `file://`:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## How moderation works

- Anyone signed in and not banned can post, with no limit on ratings per meal or per flight.
- Anonymous ratings are anonymous to the public, not to you: the admin ratings tab shows the
  poster's email beside an anonymous byline.
- Ratings are public immediately; the admin dashboard can **hide** one (it stays visible to
  its author and to admins), **edit** it, or **delete** it along with its photos.
- **Ban** blocks a user from posting new ratings or uploading photos, enforced by database
  policy rather than by the page. **Delete ratings** wipes everything they have posted.
- Removing the login itself is done in the Supabase dashboard under **Authentication → Users**;
  that requires the service role, which deliberately never reaches the browser.

## Staying inside the free tiers

- Photos are resized to 1600px and re-encoded as JPEG *in the browser* before upload, so a
  typical meal photo lands around 150–300 KB. Supabase's free plan includes 1 GB of storage,
  which is roughly 4,000 photos, and 500 MB of Postgres.
- Free Supabase projects pause after a week with no database requests. The scheduled workflow in
  [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) runs one tiny query against
  the public view twice a week to keep the project counted as active. It reads the project URL and
  anon key from `js/config.js`, so it needs no setup and does nothing until those are filled in.
  Two GitHub rules apply: scheduled workflows only run from the default branch, and GitHub switches
  them off after 60 days without a commit (re-enable it under **Actions**, or push any commit).
- GitHub Pages is free for public repositories, with a 100 GB/month soft bandwidth limit.

## Notes

Ratings are traveler-reported. The site says so in the footer: hechsherim and caterers change
without notice, so the seal in your hand is what counts.
