-- Saved state for the platform portal's "what's left" checklist: the ticks
-- the platform admin sets by hand, and the last result of each automatic
-- check. Server only: RLS on with no policies, reached through the service
-- role in server actions that check the platform admin first.
create table "PS_CLEAN_platform_checklist" (
  item_key text primary key,
  -- Set by hand for the items that can't be checked automatically.
  done boolean not null default false,
  -- Last automatic check: pass, fail or unknown.
  status text check (status in ('pass', 'fail', 'unknown')),
  detail text,
  checked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table "PS_CLEAN_platform_checklist" enable row level security;
