-- Migration 007: the diets on a report, as one list, for the diet filter.
--
-- reviews_public gains a diets column: every diet any of the report's meals
-- is marked with. The home page filters on it the same way it filters on
-- hechshers, so a report with a gluten-free meal and a vegetarian meal shows
-- up under each. Adds a column to the end of the view and changes nothing
-- else. Safe to re-run. Run after 006.

create or replace view public.reviews_public as
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
