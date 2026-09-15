-- Upgrades cleaner payout tracking (0016) into real invoicing: a stored,
-- numbered document per cleaner per period, itemized from their actual
-- completed jobs, showing what they're actually paid (not the customer
-- price) — the existing PS_CLEAN_cleaner_payouts table only ever recorded
-- customer-facing revenue as a manually-triggered summary, with no concept
-- of a cleaner's pay rate, no line items, and no persistent numbered
-- document. That table is left in place (untouched, still queryable) since
-- deleting historical records isn't warranted, but the admin UI moves to
-- this instead.

-- How a cleaner is paid. "percentage" of the job's customer price is the
-- common cleaning-industry commission split; "hourly" and "fixed_per_job"
-- cover cleaners paid a flat rate instead. pay_rate_value's unit depends on
-- pay_rate_type: a plain 0-100 number for percentage, pence for the other two
-- (consistent with every other money column in this schema).
alter table "PS_CLEAN_cleaners"
  add column pay_rate_type text not null default 'percentage' check (pay_rate_type in ('percentage', 'hourly', 'fixed_per_job')),
  add column pay_rate_value numeric not null default 60 check (pay_rate_value >= 0);

create sequence if not exists ps_clean_invoice_number_seq start 1;

create table "PS_CLEAN_cleaner_invoices" (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('INV-' || lpad(nextval('ps_clean_invoice_number_seq')::text, 5, '0')),
  cleaner_id uuid not null references "PS_CLEAN_cleaners"(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'issued' check (status in ('issued', 'paid', 'void')),
  total_pence integer not null check (total_pence >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_valid_period check (period_end > period_start)
);

create index idx_ps_clean_cleaner_invoices_cleaner on "PS_CLEAN_cleaner_invoices"(cleaner_id);

create table "PS_CLEAN_cleaner_invoice_items" (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references "PS_CLEAN_cleaner_invoices"(id) on delete cascade,
  -- Nullable + ON DELETE SET NULL: if a booking is ever hard-deleted, the
  -- invoice line (a legal-ish record of what was paid) should survive with
  -- its description intact, just losing the live link back to the booking.
  booking_id uuid references "PS_CLEAN_bookings"(id) on delete set null,
  description text not null,
  amount_pence integer not null check (amount_pence >= 0),
  created_at timestamptz not null default now()
);

create index idx_ps_clean_invoice_items_invoice on "PS_CLEAN_cleaner_invoice_items"(invoice_id);

-- A booking can only ever appear on one invoice — the application layer
-- also checks this before generating (to give a friendly error), but the
-- constraint is the real guarantee against double-paying for the same job.
create unique index idx_ps_clean_invoice_items_booking_once
  on "PS_CLEAN_cleaner_invoice_items"(booking_id)
  where booking_id is not null;

alter table "PS_CLEAN_cleaner_invoices" enable row level security;
alter table "PS_CLEAN_cleaner_invoice_items" enable row level security;

-- Admin manages everything. A cleaner can also read their own invoices and
-- line items — this is explicitly "an invoice FOR the cleaner", not just an
-- internal admin record, so they should be able to see it in their own
-- portal (see ps_clean_current_cleaner_id(), added in migration 0020).
create policy "cleaner_invoices admin all" on "PS_CLEAN_cleaner_invoices"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());
create policy "cleaner_invoices read own" on "PS_CLEAN_cleaner_invoices"
  for select using (cleaner_id = ps_clean_current_cleaner_id());

create policy "cleaner_invoice_items admin all" on "PS_CLEAN_cleaner_invoice_items"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());
create policy "cleaner_invoice_items read own" on "PS_CLEAN_cleaner_invoice_items"
  for select using (
    exists (
      select 1 from "PS_CLEAN_cleaner_invoices" i
      where i.id = invoice_id and i.cleaner_id = ps_clean_current_cleaner_id()
    )
  );
