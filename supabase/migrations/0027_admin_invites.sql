-- Admin team management: until now the only admin was ever created by a
-- direct one-off SQL insert (see DECISIONS.md — "Only one admin exists"),
-- with literally no UI to invite another one. PS_CLEAN_admin_users had
-- user_id as its primary key with no email column at all, so there was no
-- way to "invite by email and link on first login" the way
-- PS_CLEAN_cleaners already does (DECISIONS.md #3) — this migration adds
-- that same shape to admins.
alter table "PS_CLEAN_admin_users" drop constraint "PS_CLEAN_admin_users_pkey";
alter table "PS_CLEAN_admin_users" add column id uuid not null default gen_random_uuid() primary key;
alter table "PS_CLEAN_admin_users" alter column user_id drop not null;
alter table "PS_CLEAN_admin_users" add column email text;

-- Backfill the existing (only) admin's email from their auth user, since
-- every row from here on needs one to be inviteable/identifiable in the UI.
update "PS_CLEAN_admin_users" a
set email = u.email
from auth.users u
where u.id = a.user_id and a.email is null;

alter table "PS_CLEAN_admin_users" alter column email set not null;
create unique index idx_ps_clean_admin_users_email on "PS_CLEAN_admin_users" (lower(email));

-- user_id can still be looked up uniquely once linked (ps_clean_is_admin()
-- etc. all filter on user_id = auth.uid(), which relies on this).
create unique index idx_ps_clean_admin_users_user_id on "PS_CLEAN_admin_users" (user_id) where user_id is not null;
