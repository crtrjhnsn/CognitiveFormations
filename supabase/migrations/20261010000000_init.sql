-- Initial schema. Mirrors "Course Generation Pipeline — Technical Spec", plus
-- attempts and card_reviews for student progress tracking.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- Users ---------------------------------------------------------------------

create type user_role as enum ('owner', 'student');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role user_role not null default 'student',
  -- Age screen at sign-up: accounts are 13+ only (COPPA).
  confirmed_13_plus boolean not null default false,
  created_at timestamptz not null default now()
);

-- Courses and sources -------------------------------------------------------

create type course_status as enum ('draft', 'generating', 'needs_review', 'ready', 'published');
create type source_mode as enum ('materials_first', 'materials_only');
create type tier as enum ('free', 'preview', 'pro');
create type file_role as enum ('syllabus', 'slides', 'textbook', 'past_exam', 'own_notes');

create table courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  level text not null,
  subject text not null,
  alignment text,
  status course_status not null default 'draft',
  source_mode source_mode not null default 'materials_first',
  outline_version int not null default 0,
  token_budget int,
  owner_id uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table source_files (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  storage_key text not null,
  filename text not null,
  mime text not null,
  role file_role not null,
  license text,
  sha256 text not null,
  pages int,
  created_at timestamptz not null default now(),
  unique (course_id, sha256)
);

create table source_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references source_files (id) on delete cascade,
  page int,
  text text not null,
  -- Dimension depends on the embedding model chosen in phase 1.
  embedding vector(1024),
  token_count int not null
);

create table rights_attestations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  owner_id uuid not null references profiles (id),
  text_version text not null,
  signed_at timestamptz not null default now(),
  ip inet
);

create table units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  position int not null,
  title text not null,
  objectives text[] not null default '{}',
  unique (course_id, position)
);

-- Generated content ---------------------------------------------------------

create type module_type as enum ('guide', 'cards', 'formula', 'practice', 'frq', 'interview', 'exam', 'pdf', 'cram');
create type item_status as enum ('draft', 'flagged', 'approved');

create table modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  type module_type not null,
  enabled boolean not null default true,
  tier tier not null default 'pro',
  unique (course_id, type)
);

create table items (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references modules (id) on delete cascade,
  unit_id uuid references units (id) on delete cascade,
  kind text not null,
  position int not null,
  content jsonb not null,
  -- Resolved tier: 'preview' is resolved to free/pro at the Tier stage.
  tier tier not null check (tier in ('free', 'pro')),
  status item_status not null default 'draft',
  version int not null default 1,
  gap_filled boolean not null default false,
  created_at timestamptz not null default now()
);

-- Older versions of an item, kept for rollback.
create table item_versions (
  item_id uuid not null references items (id) on delete cascade,
  version int not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (item_id, version)
);

create table item_citations (
  item_id uuid not null references items (id) on delete cascade,
  chunk_id uuid not null references source_chunks (id) on delete cascade,
  quote_start int,
  quote_end int,
  primary key (item_id, chunk_id)
);

create type flag_kind as enum ('answer_mismatch', 'not_in_sources', 'source_overlap', 'schema_retry_failed', 'safety');
create type flag_status as enum ('open', 'resolved');

create table flags (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) on delete cascade,
  item_version int not null,
  kind flag_kind not null,
  detail jsonb not null default '{}',
  status flag_status not null default 'open',
  resolved_by uuid references profiles (id),
  resolved_at timestamptz
);

-- Generation jobs -----------------------------------------------------------

create type job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');

create table generation_jobs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  status job_status not null default 'queued',
  stage text,
  started_at timestamptz,
  finished_at timestamptz,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  cost_estimate numeric(10, 4),
  error text
);

create table job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references generation_jobs (id) on delete cascade,
  stage text not null,
  unit_id uuid references units (id) on delete cascade,
  module_type module_type,
  attempt int not null default 0,
  status job_status not null default 'queued',
  idempotency_key text not null unique
);

-- Billing -------------------------------------------------------------------

create type plan as enum ('pro_monthly', 'pro_semester', 'school');
create type entitlement_status as enum ('active', 'past_due', 'canceled');

-- Written only by the Stripe webhook (service role).
create table entitlements (
  user_id uuid primary key references profiles (id) on delete cascade,
  plan plan not null,
  status entitlement_status not null,
  current_period_end timestamptz not null,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);

-- Progress ------------------------------------------------------------------

create table attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  answer jsonb not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);
create index attempts_user_idx on attempts (user_id, created_at desc);

-- Spaced-repetition state per user per flashcard.
create table card_reviews (
  user_id uuid not null references profiles (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  due_at timestamptz not null,
  interval_days real not null default 0,
  ease real not null default 2.5,
  reps int not null default 0,
  lapses int not null default 0,
  last_reviewed_at timestamptz,
  primary key (user_id, item_id)
);

-- Row-level security --------------------------------------------------------
-- The service role (server-side jobs, webhooks) bypasses RLS. Everything a
-- browser can read directly is limited here; Pro content is served only
-- through server routes that apply the paywall rule.

alter table profiles enable row level security;
alter table courses enable row level security;
alter table source_files enable row level security;
alter table source_chunks enable row level security;
alter table rights_attestations enable row level security;
alter table units enable row level security;
alter table modules enable row level security;
alter table items enable row level security;
alter table item_versions enable row level security;
alter table item_citations enable row level security;
alter table flags enable row level security;
alter table generation_jobs enable row level security;
alter table job_steps enable row level security;
alter table entitlements enable row level security;
alter table attempts enable row level security;
alter table card_reviews enable row level security;

create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "read published courses" on courses for select using (status = 'published');
create policy "read units of published courses" on units for select
  using (exists (select 1 from courses c where c.id = course_id and c.status = 'published'));
create policy "read own entitlement" on entitlements for select using (auth.uid() = user_id);
create policy "read own attempts" on attempts for select using (auth.uid() = user_id);
create policy "read own card reviews" on card_reviews for select using (auth.uid() = user_id);

-- Create a profile row for every new auth user. The sign-up form passes
-- confirmed_13_plus in the user metadata; accounts without it stay unusable.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, confirmed_13_plus)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data ->> 'confirmed_13_plus')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
