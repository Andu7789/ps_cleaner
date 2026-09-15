-- Audit trail for admin overrides on bookings — so a rescheduled or
-- status-changed booking can always be explained later ("who moved this,
-- when, and from what to what"), matching the admin_change_log pattern
-- already used elsewhere in this workspace's Supabase projects. See
-- ROADMAP.md / DECISIONS.md.
create table "PS_CLEAN_admin_change_log" (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references "PS_CLEAN_bookings"(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  changed_at timestamptz not null default now()
);

create index idx_ps_clean_admin_change_log_booking on "PS_CLEAN_admin_change_log"(booking_id);
create index idx_ps_clean_admin_change_log_changed_at on "PS_CLEAN_admin_change_log"(changed_at desc);

alter table "PS_CLEAN_admin_change_log" enable row level security;

create policy "admin_change_log admin read" on "PS_CLEAN_admin_change_log"
  for select using (ps_clean_is_admin());
create policy "admin_change_log admin insert" on "PS_CLEAN_admin_change_log"
  for insert with check (ps_clean_is_admin());
