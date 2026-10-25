-- Migration 002: explicit table privileges for the API roles.
--
-- Run this if signed-in users cannot see their profile (no Admin link after
-- is_admin is set, the header shows your email instead of your name) or cannot
-- post a review. It happens when the Supabase project was created with
-- "Automatically expose new tables" switched off, so the tables never got the
-- default privileges the original schema relied on. Safe to re-run.
-- Table privileges for the API roles. Supabase normally sets these as default
-- privileges when a project has "Automatically expose new tables" switched on;
-- granting them here makes the schema work either way. Signed-out visitors
-- only ever read the reviews_public view above; signed-in users reach the
-- tables, and row-level security decides which rows.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.reviews to authenticated;
grant usage, select on sequence public.reviews_id_seq to authenticated;
