# 5-Star Roadmap

Living list of everything that takes this from **Core** (this build pass) to the full "5-star" version. Nothing discussed should get lost just because it's out of scope right now. See `DECISIONS.md` for the architectural reasoning behind choices made along the way.

## Core tier (this pass)

- [x] Cleaner profiles & availability (working days/hours, time-off blocking) — admin UI at `/admin/cleaners/[id]`
- [x] Service types (duration, price, cleaner qualifications) — admin UI at `/admin/services`
- [x] Booking flow with real-time conflict checking + buffer/travel time — DB-level `EXCLUDE` constraint (DECISIONS.md #4), tested by a dedicated agent (DECISIONS.md #7)
- [x] Customer accounts (magic-link sign up/login, booking history, saved address) — `/login`, `/account`, `/account/addresses`
- [x] Stripe payment at booking (deposit or full, off-session balance charge closer to the date) — DECISIONS.md #6
- [x] Email + SMS notifications (confirmation, day-before reminder) — `lib/notify.ts`; the actual *schedule* for the reminder/balance-charge cron routes still needs wiring to a real trigger post-deployment (see below)
- [x] Admin panel (manage cleaners/services/bookings, manual overrides) — `/admin`

Not yet done: **connecting the two `/api/cron/*` routes to an actual schedule** (needs a public deployment URL first — see "Ideas surfaced" below), and this pass's own testing was curl-based rather than a real headless-browser click-through, since no browser automation binary was available in this environment — see the session's final summary for what that does and doesn't cover.

The database currently has placeholder demo data seeded for testing (cleaner "Jane Smith", service "Standard Clean", business name "Sparkle Clean Co") — replace/remove this via the admin panel before this goes anywhere near a real customer.

## Growth tier

- [ ] Recurring/regular bookings with auto-rebooking
- [ ] Waitlist / cancellation fill notifications
- [ ] Customer ratings/reviews after each clean
- [ ] Add-on services at checkout (upsells)
- [ ] Referral scheme
- [ ] Loyalty/credit system (e.g. book 5, 6th half price)
- [ ] Cleaner payout tracking (hours/jobs completed)

## Pro tier

- [ ] Business reporting dashboard (revenue, popular services, repeat rate)
- [ ] Cleaner-facing mobile view (today's jobs, mark complete, before/after photo upload)
- [ ] Installable PWA for customers
- [ ] Multi-tenant architecture (if sold to more than one cleaning company — see DECISIONS.md #2 for what this touches)

## Ideas surfaced during the Core build (not yet tiered)

- ~~Split `buffer_minutes` into separate before/after values~~ — done (see DECISIONS.md #4), buffer-before and buffer-after are separate columns from the start.
- Cancellation fee enforcement via the saved payment method (already captured at booking time for the deposit/balance flow — see DECISIONS.md #6) — deliberately not built in Core since it needs a policy decision (how long before a job counts as "late cancellation") that's a business call, not an engineering one. The plumbing (`cancellation_fee` payment type, saved `stripe_default_payment_method_id`) is already in place for whenever that policy is decided.
- Admin "manual override" of a slot should log who overrode it and why (audit trail), matching the `admin_change_log` pattern already used elsewhere in this workspace's Supabase projects — worth doing consistently if this business ever needs to explain a scheduling decision to a customer.
- **Scheduled jobs need real wiring post-deployment.** `/api/cron/send-reminders` and `/api/cron/charge-balances` are built and working (protected by `CRON_SECRET`), but nothing calls them yet — pg_cron can't reach `localhost`, so actually scheduling them (via Supabase pg_cron+pg_net once there's a public URL, or Vercel Cron / QStash — see the research notes this pass was built from) is a same-day-as-deployment task, not something buildable before a URL exists.
- Abandoned-checkout cleanup: a booking that fails payment is auto-cancelled by the Stripe webhook (frees the slot immediately), but a booking where the customer just closes the tab mid-checkout (no webhook fires at all) stays `pending_payment` forever, holding the slot. A scheduled job to cancel stale `pending_payment` bookings after e.g. 30 minutes would close this gap — not built this pass since it's a small addition once the cron infrastructure above exists anyway.
- Twilio UK sending needs an alphanumeric sender ID registered with the MEF SMS SenderID Protection Registry before SMS actually delivers reliably in production (see the research this pass was built from) — an account-setup task, not a code change.
