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

**Deployed and live: https://ps-clean-booking.vercel.app** — Cloudflare Workers deployment hit a genuine upstream `@opennextjs/cloudflare`/Next.js 16.3.4 incompatibility (see DECISIONS.md #13 for the full investigation); Vercel worked immediately with no adapter issues. The three `/api/cron/*` routes are on real daily schedules via Vercel Cron (`vercel.json`) — reminders, balance charges, and stale-booking cleanup are actually running in production now, not just built-and-waiting. This pass's own testing was curl-based rather than a real headless-browser click-through for most of the build, since no browser automation binary was available in this environment initially (Playwright was later installed mid-session and used for the calendar redesign specifically).

The database currently has placeholder demo data seeded for testing (cleaner "Jane Smith", service "Standard Clean", business name "Sparkle Clean Co") — replace/remove this via the admin panel before this goes anywhere near a real customer.

## Growth tier

- [x] Recurring/regular bookings with auto-rebooking — `PS_CLEAN_recurring_bookings`, "Make it regular" on a confirmed booking, pause/resume from `/account`, daily `/api/cron/generate-recurring-bookings` generates the next occurrence via `ps_clean_create_booking` (service_role bypass) so it gets the same conflict-checking as a manual booking
- [x] Waitlist / cancellation fill notifications — `PS_CLEAN_waitlist_entries`, notified on cancellation from any of the three cancellation paths (customer, admin, system/webhook)
- [x] Customer ratings/reviews after each clean — `PS_CLEAN_reviews`, `/account/bookings/[id]` review form, star rating + count shown on the booking picker
- [x] Add-on services at checkout (upsells) — `PS_CLEAN_addons`/`PS_CLEAN_service_addons`, admin at `/admin/addons`, checkout lets customers select extras
- [x] Referral scheme — `/r/[code]` links, £10 credit both ways on the referred customer's first completed booking
- [x] Loyalty/credit system — every 5th completed booking earns a spendable credit worth half its price; one shared `PS_CLEAN_customer_credits` ledger backs both this and referrals
- [x] Cleaner payout tracking (hours/jobs completed) — `PS_CLEAN_cleaner_payouts`, admin at `/admin/payouts`

**All 7 Growth-tier items are now built and deployed.**

## Pro tier

- [x] Business reporting dashboard (revenue, popular services, repeat rate) — `/admin/reports`
- [x] Cleaner-facing mobile view (today's jobs, mark complete, before/after photo upload) — `/cleaner`, magic-link sign-in same as customers/admins, first login links by email (see DECISIONS.md #3, #14)
- [x] Installable PWA for customers — `public/manifest.webmanifest` + minimal service worker (static assets only, deliberately not offline-first for a live booking system)
- [ ] Multi-tenant architecture (if sold to more than one cleaning company — see DECISIONS.md #2 for what this touches)

## Ideas surfaced during the Pro build (not yet tiered)

- [x] Cleaner invoicing (upgrades the old "payout tracking" into real numbered invoices, itemized from actual completed jobs, computed from each cleaner's own pay rate, visible to both admin and the cleaner) — `/admin/invoices`, `/cleaner/invoices`, see DECISIONS.md #16. The old `PS_CLEAN_cleaner_payouts` table/page (`/admin/payouts`) is left in place, untouched, but no longer linked from the nav — superseded, not deleted.

**Two real bugs found and fixed while building this tier — see DECISIONS.md #14:** magic-link sign-in never actually completed for anyone (implicit-flow token in a URL fragment vs. the app's PKCE-only callback route), and a cleaner could read/write another cleaner's booking photos (a pre-existing project-wide "Allow all" storage policy silently overriding this app's own bucket-scoped RLS). Both confirmed live and fixed before this tier shipped.

## Ideas surfaced during the Core build (not yet tiered)

- ~~Split `buffer_minutes` into separate before/after values~~ — done (see DECISIONS.md #4), buffer-before and buffer-after are separate columns from the start.
- Cancellation fee enforcement via the saved payment method (already captured at booking time for the deposit/balance flow — see DECISIONS.md #6) — deliberately not built in Core since it needs a policy decision (how long before a job counts as "late cancellation") that's a business call, not an engineering one. The plumbing (`cancellation_fee` payment type, saved `stripe_default_payment_method_id`) is already in place for whenever that policy is decided.
- Admin "manual override" of a slot should log who overrode it and why (audit trail), matching the `admin_change_log` pattern already used elsewhere in this workspace's Supabase projects — worth doing consistently if this business ever needs to explain a scheduling decision to a customer.
- **Scheduled jobs need real wiring post-deployment.** `/api/cron/send-reminders`, `/api/cron/charge-balances`, and `/api/cron/cancel-stale-bookings` are all built and working (protected by `CRON_SECRET`), but nothing calls any of them on a schedule yet — pg_cron can't reach `localhost`, so actually scheduling them (via Supabase pg_cron+pg_net once there's a public URL, or Vercel Cron / QStash — see the research notes this pass was built from) is a same-day-as-deployment task, not something buildable before a URL exists.
- ~~Abandoned-checkout cleanup~~ — done: `/api/cron/cancel-stale-bookings` cancels any `pending_payment` booking older than 30 minutes, freeing its slot. Needs the same post-deployment scheduling as the other two cron routes above.
- Twilio UK sending needs an alphanumeric sender ID registered with the MEF SMS SenderID Protection Registry before SMS actually delivers reliably in production (see the research this pass was built from) — an account-setup task, not a code change. Currently this is moot anyway: `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` are still empty placeholders in both `.env.local` and Vercel — SMS doesn't send at all yet (see DECISIONS.md #15, found the same way the equivalent email gap was).
- **Email now sends for real** (DECISIONS.md #15 — `RESEND_API_KEY` had been an empty placeholder since before this pass, silently breaking every email including magic-link login), but from Resend's sandbox address (`onboarding@resend.dev`), since this Resend account's only verified domains belong to the user's other apps. Getting PS Cleaning its own verified sending domain is a pre-launch task, not urgent for testing/demo use.
- **Only one admin exists** (the owner, bootstrapped directly via SQL since there was no signup-time reason to create one automatically). Inviting additional admins/staff currently has no UI — the only path is another direct insert into `PS_CLEAN_admin_users`. Worth a small admin-management screen once there's a second person who needs access.
- ~~Manual payment reconciliation~~ — done: `/admin/bookings` flags any `pending_payment` row and offers a "Sync with Stripe" action (`reconcilePaymentAction`) that checks the real PaymentIntent status and applies the same confirmation logic the webhook uses. Built directly in response to two real bookings getting stuck this way during testing (see DECISIONS.md #10/#11) — a safety net for whenever the webhook doesn't fire, not just a local-dev convenience.
