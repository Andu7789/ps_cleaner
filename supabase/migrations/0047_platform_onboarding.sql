-- Platform side of the white label: who can run the platform portal, and the
-- onboarding requests a new business owner fills in before it is provisioned.
-- Both tables are server only: RLS is on with no policies, so the anon and
-- authenticated roles can never read them. Everything goes through the
-- service role in server actions, which check the request token or the
-- platform admin first.

create table "PS_CLEAN_platform_admins" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  created_at timestamptz not null default now(),
  constraint platform_admin_email_lowercase check (email = lower(email))
);
create unique index idx_ps_clean_platform_admins_email on "PS_CLEAN_platform_admins" (email);
alter table "PS_CLEAN_platform_admins" enable row level security;

insert into "PS_CLEAN_platform_admins" (email) values ('andrew.britain@gmail.com');

create table "PS_CLEAN_onboarding_requests" (
  id uuid primary key default gen_random_uuid(),
  -- 48 hex characters from the app (crypto random), used as the owner's link.
  token text not null unique,
  status text not null default 'invited'
    check (status in ('invited', 'in_progress', 'submitted', 'provisioned', 'archived')),
  -- Copied out of answers so the portal list can show them without parsing.
  owner_name text,
  owner_email text,
  business_name text,
  answers jsonb not null default '{}'::jsonb,
  -- One entry per provisioning step: { step, ok, detail, at }.
  provision_log jsonb not null default '[]'::jsonb,
  business_id uuid references "PS_CLEAN_businesses"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  provisioned_at timestamptz
);
create index idx_ps_clean_onboarding_requests_status on "PS_CLEAN_onboarding_requests" (status, created_at desc);
alter table "PS_CLEAN_onboarding_requests" enable row level security;
