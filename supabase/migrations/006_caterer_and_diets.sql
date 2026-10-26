-- Migration 006: who catered each meal, and which diets it suits.
--
-- Two more things a traveler can record per meal: the caterer whose name is
-- on the box (Regal, Lewis', ...) and the diets the meal was suitable for
-- (vegetarian, gluten free, peanut free, ...). The allowed diet keys are
-- checked here and must match DIETS in js/options.js. Rebuilds the public
-- view and save_report() to carry both (the view includes the diets list
-- from 007, so running these two in either order ends the same). Safe to
-- re-run. Run after 005.

alter table public.review_meals add column if not exists caterer text;
alter table public.review_meals add column if not exists diets text[] not null default '{}';
alter table public.review_meals drop constraint if exists review_meals_diets_check;
alter table public.review_meals add constraint review_meals_diets_check check (diets <@ array[
  'vegetarian', 'vegan', 'gluten_free', 'coeliac', 'peanut_free', 'nut_free',
  'dairy_free', 'egg_free', 'sesame_free', 'diabetic'
]::text[]);
create index if not exists review_meals_caterer_idx on public.review_meals (caterer);

-- The public view: one row per report, with its meals as JSON and summary
-- columns (average score, seals, all photos) the list pages filter and sort on.
-- A report with no meal rows (written by an old copy of the page) falls back
-- to its own meal columns.
drop view if exists public.reviews_public;
create view public.reviews_public as
  with m as (
    select review_id,
           jsonb_agg(jsonb_build_object(
             'position', position, 'meal_type', meal_type, 'meal_name', meal_name,
             'hechsher', hechsher, 'caterer', caterer, 'diets', to_jsonb(diets),
             'rating', rating, 'comment', comment,
             'photos', to_jsonb(photos)) order by position)                         as meals,
           round(avg(rating)::numeric, 2)                                            as rating,
           array_remove(array_agg(distinct hechsher), null)                          as hechshers,
           array_remove(array_agg(distinct caterer), null)                           as caterers,
           (array_agg(hechsher order by position) filter (where hechsher is not null))[1] as hechsher,
           string_agg(meal_name, ' · ' order by position) filter (where meal_name is not null) as meal_name,
           string_agg(meal_type, ' · ' order by position) filter (where meal_type is not null) as meal_type
    from public.review_meals
    group by review_id
  )
  select r.id,
         case when r.is_anonymous then null else r.user_id end as user_id,
         r.airline, r.airline_iata, r.flight_number, r.flight_id,
         r.origin_city, r.destination_city, r.flight_date, r.cabin_class,
         coalesce(m.meal_type, case when m.review_id is null then r.meal_type end) as meal_type,
         coalesce(m.meal_name, case when m.review_id is null then r.meal_name end) as meal_name,
         coalesce(m.hechsher, case when m.review_id is null then r.hechsher end)   as hechsher,
         case when m.review_id is null then array_remove(array[r.hechsher], null) else m.hechshers end as hechshers,
         coalesce(m.caterers, '{}')                                                 as caterers,
         coalesce(m.rating, r.rating::numeric)                                      as rating,
         case when m.review_id is null then r.comment end                          as comment,
         case when m.review_id is null then r.photos
              else (select coalesce(array_agg(p.photo order by rm.position, p.ord), '{}')
                    from public.review_meals rm, unnest(rm.photos) with ordinality p(photo, ord)
                    where rm.review_id = r.id) end                                  as photos,
         coalesce(m.meals, case when r.rating is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
             'position', 1, 'meal_type', r.meal_type, 'meal_name', r.meal_name, 'hechsher', r.hechsher,
             'rating', r.rating, 'comment', r.comment, 'photos', to_jsonb(r.photos))) end) as meals,
         r.respect_score, r.kosher_care_score, r.experience_notes,
         r.author_name, r.is_anonymous, r.created_at,
         f.origin_iata, f.destination_iata, f.operating_iata, f.codeshare, f.aircraft,
         a.name as airline_name, a.logo_url as airline_logo_url,
         -- every diet any meal on the report is marked with, for the diet filter
         coalesce((select array_agg(distinct d order by d)
                   from public.review_meals rm, unnest(rm.diets) d
                   where rm.review_id = r.id), '{}')                                  as diets
  from public.reviews r
  left join m on m.review_id = r.id
  left join public.flights f on f.id = r.flight_id
  left join public.airlines a on a.iata = r.airline_iata
  where not r.is_hidden;

grant select on public.reviews_public to anon, authenticated;

-- Saves a report and its meals together. With report_id null it creates a
-- report for the caller; with an id it updates that report (the caller's own,
-- or any if admin) and replaces its meals. Runs with the caller's rights, so
-- every row-level security rule above still applies.
create or replace function public.save_report(report jsonb, meals jsonb, report_id bigint default null)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  rid bigint;
  meal jsonb;
  n int := 0;
  txt constant text[] := array['airline','airline_iata','flight_number','origin_city','destination_city','cabin_class','experience_notes'];
begin
  if jsonb_typeof(meals) is distinct from 'array' or jsonb_array_length(meals) = 0 then
    raise exception 'A report needs at least one meal.';
  end if;
  if jsonb_array_length(meals) > 6 then
    raise exception 'A report can have at most six meals.';
  end if;
  if nullif(trim(report->>'airline'), '') is null or nullif(trim(report->>'origin_city'), '') is null then
    raise exception 'Airline and the city the meal was loaded in are required.';
  end if;

  if report_id is null then
    insert into reviews (user_id, airline, airline_iata, flight_id, flight_number, origin_city,
                         destination_city, flight_date, cabin_class, respect_score,
                         kosher_care_score, experience_notes, is_anonymous)
    values (auth.uid(),
            trim(report->>'airline'),
            nullif(trim(report->>'airline_iata'), ''),
            nullif(report->>'flight_id', '')::bigint,
            nullif(trim(report->>'flight_number'), ''),
            trim(report->>'origin_city'),
            nullif(trim(report->>'destination_city'), ''),
            nullif(report->>'flight_date', '')::date,
            nullif(trim(report->>'cabin_class'), ''),
            nullif(report->>'respect_score', '')::smallint,
            nullif(report->>'kosher_care_score', '')::smallint,
            nullif(trim(report->>'experience_notes'), ''),
            coalesce((report->>'is_anonymous')::boolean, false))
    returning id into rid;
  else
    update reviews set
      airline           = trim(report->>'airline'),
      airline_iata      = nullif(trim(report->>'airline_iata'), ''),
      flight_id         = nullif(report->>'flight_id', '')::bigint,
      flight_number     = nullif(trim(report->>'flight_number'), ''),
      origin_city       = trim(report->>'origin_city'),
      destination_city  = nullif(trim(report->>'destination_city'), ''),
      flight_date       = nullif(report->>'flight_date', '')::date,
      cabin_class       = nullif(trim(report->>'cabin_class'), ''),
      respect_score     = nullif(report->>'respect_score', '')::smallint,
      kosher_care_score = nullif(report->>'kosher_care_score', '')::smallint,
      experience_notes  = nullif(trim(report->>'experience_notes'), ''),
      is_anonymous      = coalesce((report->>'is_anonymous')::boolean, false),
      -- the old single-meal columns are superseded by review_meals
      rating = null, meal_type = null, meal_name = null, hechsher = null, comment = null, photos = '{}'
    where id = report_id
    returning id into rid;
    if rid is null then
      raise exception 'That report was not found, or it is not yours to edit.';
    end if;
    delete from review_meals where review_id = rid;
  end if;

  for meal in select value from jsonb_array_elements(meals) loop
    n := n + 1;
    insert into review_meals (review_id, position, meal_type, meal_name, hechsher, caterer, diets, rating, comment, photos)
    values (rid, n,
            nullif(trim(meal->>'meal_type'), ''),
            nullif(trim(meal->>'meal_name'), ''),
            nullif(trim(meal->>'hechsher'), ''),
            nullif(trim(meal->>'caterer'), ''),
            coalesce(array(select distinct d from jsonb_array_elements_text(coalesce(meal->'diets', '[]'::jsonb)) d order by d), '{}'),
            (meal->>'rating')::smallint,
            nullif(trim(meal->>'comment'), ''),
            coalesce(array(select jsonb_array_elements_text(coalesce(meal->'photos', '[]'::jsonb))), '{}'));
  end loop;

  return rid;
end;
$$;

revoke execute on function public.save_report(jsonb, jsonb, bigint) from public, anon;
grant execute on function public.save_report(jsonb, jsonb, bigint) to authenticated;
