-- Review queue and publishing (phase 3).

-- How the owner cleared a flag: approve as is, edit, regenerate, or roll back.
alter table flags add column resolution text
  check (resolution in ('approve', 'edit', 'regenerate', 'rollback'));

alter table courses add column published_at timestamptz;

create index items_unit_id_idx on items (unit_id);
