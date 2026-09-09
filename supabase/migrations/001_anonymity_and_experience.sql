-- Migration for projects that already ran schema.sql before these features
-- existed. On a brand-new project just run schema.sql, which already includes
-- everything here. Safe to run more than once.
--
-- Adds:
--   * per-review anonymity (and hides the poster's id from public reads)
--   * two optional Jewish-traveler-experience scores plus a note

-- 1. new columns -------------------------------------------------------------
alter table public.reviews
  add column if not exists is_anonymous  boolean not null default false,
  add column if not exists respect_score smallint,
  add column if not exists kosher_care_score smallint,
  add column if not exists experience_notes text;

alter table public.reviews drop constraint if exists reviews_respect_score_check;
alter table public.reviews
  add constraint reviews_respect_score_check
  check (respect_score is null or respect_score between 1 and 5);

alter table public.reviews drop constraint if exists reviews_kosher_care_score_check;
alter table public.reviews
  add constraint reviews_kosher_care_score_check
  check (kosher_care_score is null or kosher_care_score between 1 and 5);

create index if not exists reviews_respect_idx on public.reviews (respect_score);
create index if not exists reviews_kosher_care_idx on public.reviews (kosher_care_score);

-- 2. bylines honour anonymity ------------------------------------------------
create or replace function public.set_review_author_name()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.author_name := case
    when new.is_anonymous then 'Anonymous'
    else coalesce(
      nullif(trim((select display_name from public.profiles where id = new.user_id)), ''),
      'Traveler')
  end;
  return new;
end;
$$;

create or replace function public.sync_author_name()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.reviews
       set author_name = coalesce(nullif(trim(new.display_name), ''), 'Traveler')
     where user_id = new.id
       and not is_anonymous;
  end if;
  return new;
end;
$$;

-- 3. public reads go through a view that cannot leak who posted --------------
-- Direct table access is now limited to the row's owner and to admins, so an
-- anonymous review's user_id never reaches the browser and nobody can match a
-- person's anonymous posts to their named ones.
drop policy if exists reviews_select_public on public.reviews;
drop policy if exists reviews_select_own_or_admin on public.reviews;
create policy reviews_select_own_or_admin on public.reviews
  for select using (user_id = auth.uid() or public.is_admin());

-- security_invoker is deliberately left off: the view runs as its owner and
-- does its own filtering, which is what lets signed-out visitors browse.
drop view if exists public.reviews_public;
create view public.reviews_public as
  select id,
         case when is_anonymous then null else user_id end as user_id,
         airline, flight_number, origin_city, destination_city, flight_date,
         cabin_class, meal_type, meal_name, hechsher, rating, comment, photos,
         respect_score, kosher_care_score, experience_notes,
         author_name, is_anonymous, created_at
  from public.reviews
  where not is_hidden;

grant select on public.reviews_public to anon, authenticated;

-- Refresh bylines for rows written before the anonymity column existed.
update public.reviews r
   set author_name = coalesce(nullif(trim(p.display_name), ''), 'Traveler')
  from public.profiles p
 where p.id = r.user_id
   and not r.is_anonymous
   and r.author_name is distinct from coalesce(nullif(trim(p.display_name), ''), 'Traveler');
