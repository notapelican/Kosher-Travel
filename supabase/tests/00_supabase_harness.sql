-- Stand-ins for the pieces Supabase normally provides (auth schema, storage
-- schema, the anon/authenticated roles), so schema.sql can be applied to a
-- throwaway local Postgres and its security rules tested. Not for production.
--
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;
-- storage.foldername returns the path parts before the filename
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)];
$$;

grant usage on schema public, storage to anon, authenticated;
-- No default table privileges on purpose: a Supabase project created with
-- "Automatically expose new tables" switched off has none, and schema.sql
-- must grant what the site needs explicitly.
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
