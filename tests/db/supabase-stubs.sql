-- Minimal stand-ins for the parts of Supabase the migrations reference, so
-- they can be applied to a plain Postgres in tests and CI.
-- Roles are cluster-wide, so another test database may have created them.
do $$ begin
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
