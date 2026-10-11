-- Owner flow: ingest status on files, per-step errors and token use, and the
-- private bucket that holds uploaded source files.

create type ingest_status as enum ('pending', 'ingested', 'failed');

alter table source_files
  add column status ingest_status not null default 'pending',
  add column error text;

alter table generation_jobs
  add column created_at timestamptz not null default now();

alter table job_steps
  add column error text,
  add column tokens_in bigint not null default 0,
  add column tokens_out bigint not null default 0,
  add column started_at timestamptz,
  add column finished_at timestamptz;

create index source_chunks_file_idx on source_chunks (file_id);
create index items_module_idx on items (module_id);
create index flags_item_idx on flags (item_id) where status = 'open';

-- Source files are never served to students: private bucket, server access only.
insert into storage.buckets (id, name, public)
values ('sources', 'sources', false)
on conflict (id) do nothing;

-- The job step that created an item, so a retried step replaces its own
-- items instead of duplicating them.
alter table items add column job_step_id uuid references job_steps (id) on delete set null;
create index items_job_step_idx on items (job_step_id);
