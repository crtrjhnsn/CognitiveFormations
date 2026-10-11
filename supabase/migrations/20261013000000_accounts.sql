-- Student accounts and paywall (phase 4).

-- Lets the account page say "ends on" instead of "renews on" after a cancel.
alter table entitlements add column cancel_at_period_end boolean not null default false;

create index attempts_item_idx on attempts (item_id);
