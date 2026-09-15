-- Growth tier: customer ratings/reviews after each clean.
--
-- One review per booking (not per customer/cleaner pair) — a customer who
-- books the same cleaner five times can review each visit separately,
-- which is more honest than one running average per relationship.
create table "PS_CLEAN_reviews" (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references "PS_CLEAN_bookings"(id) on delete cascade,
  customer_id uuid not null references "PS_CLEAN_customers"(id) on delete cascade,
  cleaner_id uuid not null references "PS_CLEAN_cleaners"(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index idx_ps_clean_reviews_cleaner on "PS_CLEAN_reviews"(cleaner_id);
create index idx_ps_clean_reviews_customer on "PS_CLEAN_reviews"(customer_id);

alter table "PS_CLEAN_reviews" enable row level security;

-- Public read: this is exactly the trust signal (star rating, review count)
-- shown on the booking picker — no reason to gate it behind auth. Reviews
-- carry no customer-identifying fields beyond what the reviewer chose to
-- write in their own comment.
create policy "reviews public read" on "PS_CLEAN_reviews"
  for select using (true);

-- A customer can only review their OWN completed booking, and only once
-- (enforced by the unique booking_id above, not just this check) — the
-- ps_clean_create_review() RPC in 0011 is the actual insert path since it
-- also verifies the booking is 'completed', which a raw RLS check on this
-- table alone can't do without a cross-table subquery repeated on every
-- policy evaluation; see that migration for the real validation.
create policy "reviews admin all" on "PS_CLEAN_reviews"
  for all using (ps_clean_is_admin()) with check (ps_clean_is_admin());
