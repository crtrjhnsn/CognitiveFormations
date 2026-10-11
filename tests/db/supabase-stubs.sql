-- Minimal stand-ins for the parts of Supabase the migrations reference, so
-- they can be applied to a plain Postgres in tests and CI.
-- Roles are cluster-wide, so another test database may have created them,
-- possibly at this same moment (test files run in parallel).
do $$
declare
  name text;
begin
  foreach name in array array['authenticated', 'anon'] loop
    begin
      execute format('create role %I', name);
    exception when duplicate_object or unique_violation then
      null;
    end;
  end loop;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
