\set ON_ERROR_STOP off
\pset pager off
\timing off

-- Three users, created the way Supabase creates them (the trigger makes profiles).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com', '{"full_name":"Admin Abe"}'),
  ('22222222-2222-2222-2222-222222222222', 'shy@example.com',   '{"full_name":"Shy Sarah"}'),
  ('33333333-3333-3333-3333-333333333333', 'banned@example.com','{"full_name":"Spammer"}');

update public.profiles set is_admin  = true where email = 'admin@example.com';
update public.profiles set is_banned = true where email = 'banned@example.com';

\echo '--- profiles auto-created from auth metadata:'
select email, display_name, is_admin, is_banned from public.profiles order by email;

-- helper to act as a given user through the authenticated role
create or replace procedure act_as(uid text) language plpgsql as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claim.sub', uid, true);
end; $$;

\echo ''
\echo '=== 1. Shy Sarah posts one signed and one anonymous review ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into public.reviews (user_id, airline, origin_city, rating, is_anonymous, respect_score, kosher_care_score)
values ('22222222-2222-2222-2222-222222222222', 'El Al', 'Newark (EWR)', 4, false, 5, 5);
insert into public.reviews (user_id, airline, origin_city, rating, is_anonymous, respect_score, comment)
values ('22222222-2222-2222-2222-222222222222', 'Lufthansa', 'Frankfurt (FRA)', 2, true, 1, 'Hostile crew.');
select 'inserted, bylines: ' || string_agg(author_name || '/' || is_anonymous::text, ', ')
  from public.reviews;
commit;

\echo ''
\echo '=== 2. A user cannot post as somebody else (expect: policy violation) ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into public.reviews (user_id, airline, origin_city, rating)
values ('11111111-1111-1111-1111-111111111111', 'Fake Air', 'Nowhere', 5);
rollback;

\echo ''
\echo '=== 3. A banned user cannot post (expect: policy violation) ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
insert into public.reviews (user_id, airline, origin_city, rating)
values ('33333333-3333-3333-3333-333333333333', 'Spam Air', 'Spamville', 5);
rollback;

\echo ''
\echo '=== 4. A user cannot make themselves an admin (expect: policy violation) ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
update public.profiles set is_admin = true where id = '22222222-2222-2222-2222-222222222222';
rollback;

\echo ''
\echo '=== 5. A user CAN rename themselves; signed bylines follow, anonymous ones do not ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
update public.profiles set display_name = 'Sarah S.' where id = '22222222-2222-2222-2222-222222222222';
reset role;
select airline, author_name, is_anonymous from public.reviews order by id;
commit;

\echo ''
\echo '=== 6. Signed-out visitor (anon role): view is readable, table is not ==='
begin;
set local role anon;
select airline, rating, author_name, user_id, respect_score from public.reviews_public order by id;
\echo '   -- direct table read as anon (expect: permission denied):'
select count(*) from public.reviews;
rollback;

\echo ''
\echo '=== 7. Anonymous reviews expose no user_id, so they cannot be correlated ==='
begin;
set local role anon;
select author_name, coalesce(user_id::text, 'NULL — not exposed') as user_id from public.reviews_public order by id;
rollback;

\echo ''
\echo '=== 8. Another signed-in user cannot read the reviews table directly ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select count(*) as rows_visible_to_other_user from public.reviews;
rollback;

\echo ''
\echo '=== 9. Admin hides a review; it leaves the public view but the owner still sees it ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
update public.reviews set is_hidden = true where airline = 'Lufthansa';
select 'admin sees ' || count(*) || ' rows in table' from public.reviews;
reset role;
set local role anon;
select 'anon sees ' || count(*) || ' rows in view' from public.reviews_public;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select 'owner sees ' || count(*) || ' of their own rows incl. hidden' from public.reviews;
commit;

\echo ''
\echo '=== 10. Score range is enforced (expect: check constraint violation) ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into public.reviews (user_id, airline, origin_city, rating, respect_score)
values ('22222222-2222-2222-2222-222222222222', 'El Al', 'TLV', 5, 6);
rollback;

\echo ''
\echo '=== 11. Photo uploads are scoped to the uploader folder ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into storage.objects (bucket_id, name) values ('meal-photos', '22222222-2222-2222-2222-222222222222/ok.jpg');
\echo '   -- uploading into another user folder (expect: policy violation):'
insert into storage.objects (bucket_id, name) values ('meal-photos', '11111111-1111-1111-1111-111111111111/steal.jpg');
rollback;

\echo ''
\echo '=== 12. Nobody can spoof a byline by writing author_name directly ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into public.reviews (user_id, airline, origin_city, rating, author_name)
values ('22222222-2222-2222-2222-222222222222', 'El Al', 'JFK', 3, 'Admin Abe');
select 'attempted byline "Admin Abe" stored as: ' || author_name from public.reviews where origin_city = 'JFK';
rollback;

\echo ''
\echo '=== 13. Reference tables: anyone can read airlines and flights; nobody but the service role writes flights ==='
begin;
set local role anon;
select 'anon sees ' || count(*) || ' airlines' from public.airlines;
select 'anon sees ' || count(*) || ' flights' from public.flights;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
\echo '   -- a signed-in user inserting a flight (expect: permission denied):'
insert into public.flights (airline_iata, number) values ('LY', '26');
rollback;

\echo ''
\echo '=== 14. Site settings: everyone reads, only an admin writes (expect: one policy violation) ==='
begin;
set local role anon;
select 'anon reads design = ' || (value->>'skin') from public.site_settings where key = 'design';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
update public.site_settings set value = '{"skin":"board","layout":"table"}' where key = 'design';
select 'after a normal user tries: skin = ' || (value->>'skin') from public.site_settings where key = 'design';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
update public.site_settings set value = '{"skin":"board","layout":"table"}' where key = 'design';
select 'after the admin: skin = ' || (value->>'skin') from public.site_settings where key = 'design';
rollback;

\echo ''
\echo '=== 15. A review posted with an airline code gets the airline name filled in ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into public.reviews (user_id, airline, airline_iata, flight_number, origin_city, rating)
values ('22222222-2222-2222-2222-222222222222', 'whatever the browser sent', 'LY', 'LY 26', 'Newark (EWR)', 4);
select 'stored airline: ' || airline || ' (' || airline_iata || ')' from public.reviews where airline_iata = 'LY';
reset role;
set local role anon;
select 'public view shows airline_name = ' || airline_name from public.reviews_public where airline_iata = 'LY';
rollback;

\echo ''
\echo '=== 16. save_report: a signed-in user posts one report with two meals ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select 'created report: ' || (public.save_report(
  '{"airline":"El Al","airline_iata":"LY","flight_number":"LY 26","origin_city":"New York (JFK)","respect_score":"5"}'::jsonb,
  '[{"meal_type":"Dinner","rating":4,"hechsher":"OU","meal_name":"Chicken"},
    {"meal_type":"Breakfast","rating":5,"hechsher":"Badatz","photos":["22222222-2222-2222-2222-222222222222/a.jpg"]}]'::jsonb) is not null);
select 'meals stored: ' || count(*) from public.review_meals m join public.reviews r on r.id = m.review_id where r.flight_number = 'LY 26';
reset role;
set local role anon;
select 'public view: ' || meal_name || ' | avg ' || rating || ' | seals ' || array_to_string(hechshers, '+') || ' | photos ' || cardinality(photos) || ' | meals ' || jsonb_array_length(meals)
  from public.reviews_public where flight_number = 'LY 26';
commit;

\echo ''
\echo '=== 17. Nobody can add a meal to somebody else''s report (expect: policy violation) ==='
select id as ly26 from public.reviews where flight_number = 'LY 26' \gset
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
insert into public.review_meals (review_id, position, rating) values (:ly26, 5, 1);
rollback;

\echo ''
\echo '=== 18. Nobody can edit somebody else''s report through save_report (expect: not found) ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select public.save_report('{"airline":"El Al","origin_city":"Hacked"}'::jsonb, '[{"rating":1}]'::jsonb,
  (select id from public.reviews_public where flight_number = 'LY 26'));
rollback;

\echo ''
\echo '=== 19. Signed-out visitors cannot read the meals table; meals of hidden reports leave the view ==='
begin;
set local role anon;
\echo '   -- direct read of review_meals as anon (expect: permission denied):'
select count(*) from public.review_meals;
rollback;
begin;
update public.reviews set is_hidden = true where flight_number = 'LY 26';
set local role anon;
select 'reports for LY 26 in the public view after hiding: ' || count(*) from public.reviews_public where flight_number = 'LY 26';
rollback;

\echo ''
\echo '=== 20. A report needs at least one meal, and scores stay within 1-5 (expect: two errors) ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select public.save_report('{"airline":"El Al","origin_city":"JFK"}'::jsonb, '[]'::jsonb);
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select public.save_report('{"airline":"El Al","origin_city":"JFK"}'::jsonb, '[{"rating":9}]'::jsonb);
rollback;

\echo ''
\echo '=== 21. Editing your own report replaces its meals ==='
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select 'edited report keeps its id: ' || (public.save_report('{"airline":"El Al","flight_number":"LY 26","origin_city":"New York (JFK)"}'::jsonb,
   '[{"meal_type":"Snack","rating":3}]'::jsonb, (select id from public.reviews where flight_number = 'LY 26')) = (select id from public.reviews where flight_number = 'LY 26'));
select 'meals after edit: ' || string_agg(m.meal_type || '/' || m.rating, ', ') from public.review_meals m join public.reviews r on r.id = m.review_id where r.flight_number = 'LY 26';
rollback;
