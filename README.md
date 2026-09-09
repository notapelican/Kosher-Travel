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
airlines.html   per-airline averages: meal, respect, kosher handling
submit.html     post a rating (also used to edit one, ?edit=<id>)
mine.html       your own ratings + display name
admin.html      admin dashboard: hide/edit/delete ratings, ban/promote users
css/styles.css  all styling (light + dark)
js/config.js    <- the only file you have to edit
js/app.js       Supabase client, auth, shared rendering
js/browse.js  js/airlines.js  js/submit.js  js/mine.js  js/admin.js
js/options.js   airline / hechsher / meal lists, and the experience-score wording
supabase/schema.sql       tables, row-level security, storage bucket
supabase/migrations/      changes to apply to an already-deployed database
```

## What a rating records

The form is one always-visible card for the flight, then three collapsible sections. Each
collapsed section still summarizes itself in its header ("★★★★ · 2 photos", "1 of 2 scored ·
written"), so nothing you filled in is hidden from you. A required field can never be trapped
in a closed section: submitting opens all of them first.

**The meal.** A required 1–5 score, the hechsher on the seal, what it actually was, an
optional write-up, and up to four photos of the tray — photos live here rather than at the
bottom of the form, since they are pictures of the meal. (Airline and the city the meal was
loaded in are required too, and sit in the flight card above.)

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
   policies, and the public `meal-photos` storage bucket. It is safe to re-run.
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
- **Google**: enable the provider and paste in a Google OAuth client ID/secret
  ([Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client →
  Web application). Add `https://<project-ref>.supabase.co/auth/v1/callback` as the
  authorized redirect URI.

Then under **Authentication → URL Configuration**, add your GitHub Pages URL
(e.g. `https://notapelican.github.io/Kosher-Travel/`) to **Site URL** and **Redirect URLs**,
plus `http://localhost:8000/` if you want to develop locally.

### 4. Publish

In this repo: **Settings → Pages → Build and deployment → Deploy from a branch**, choose your
branch and the `/ (root)` folder. GitHub serves it at
`https://<user>.github.io/Kosher-Travel/` within a minute or two. A custom domain is free too
(you only pay whatever your registrar charges for the name).

### 5. Make yourself an admin

Sign in on the live site once so your profile row exists, then run this in the Supabase
SQL editor:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

Reload the site and an **Admin** link appears in the header.

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
- Free Supabase projects pause after a week with no traffic; opening the site resumes them.
- GitHub Pages is free for public repositories, with a 100 GB/month soft bandwidth limit.

## Notes

Ratings are traveler-reported. The site says so in the footer: hechsherim and caterers change
without notice, so the seal in your hand is what counts.
