# Architecture Decisions

Log of decisions made without stopping to ask, per the overnight autonomy note. Each entry: the decision, why, and how reversible it is.

---

## 1. Which Supabase project to use

**Decision:** Use "Andu7789's Project" (`rmooksnngqyzqraeicvr`) — the project Project Buster's Vite app uses — per explicit user correction. Not the "Coffee app" project, and not a new project.

**Why:** A workspace survey initially found two candidate Supabase projects and no obvious single "shared" one, so an inference was made (Coffee app project, since it already ran a multi-tenant schema on a matching stack) — but the user corrected this directly: the intended shared project is `rmooksnngqyzqraeicvr`. Inspecting it afterward confirms this is clearly the right one — it already hosts unprefixed/prefixed tables for a wide range of unrelated personal apps and hobby trackers on one Postgres instance (e.g. `buster_*` for Project Buster, `embrace_*`, `yogahub_*`, `md_*`, trading-journal tables, hiking/photo tables, a second unrelated `locations`/`menu_items`/`orders` set, etc.) — i.e. it already *is* the general-purpose shared project this brief describes, and the established convention there is exactly "prefix your own app's tables," which `PS_CLEAN_` follows.

**Nuance carried over from the original (superseded) reasoning:** this project already has generic-sounding tables — bare `services`, `bookings`, `appointments`, `availabilities`, `recurring_blocked` — that almost certainly belong to Project Buster's own scheduling/calendar-sync feature. PS Cleaning must never read/write those tables or assume they're related; every PS Cleaning table is `PS_CLEAN_`-prefixed specifically to avoid exactly this kind of name collision, and has zero foreign keys into any other app's tables.

**Reversibility:** High. Nothing references another app's tables, so migrating PS Cleaning to its own dedicated Supabase project later is a schema dump/restore of the `PS_CLEAN_*` tables plus their RLS policies and storage buckets — no data migration of shared entities required.

---

## 2. Single-tenant app, not multi-tenant

**Decision:** The app itself has no tenant-switching logic (no subdomain-based tenant resolution like Root Cafe's `getCurrentTenant()`). It is built for exactly one cleaning company.

**Why:** The brief explicitly scopes this to single-tenant for now, with multi-tenancy deferred to the 5-star roadmap (see ROADMAP.md) if this is ever sold to more than one cleaning company. Building tenant-switching now would be speculative complexity the brief didn't ask for.

**How "don't hardcode assuming this is the only project in the database" was satisfied instead:** every table, RLS policy, and (future) storage bucket is `PS_CLEAN_`-prefixed and self-contained, so the database can safely host other apps' tables alongside it, and this app's tables can be lifted out cleanly later.

**Reversibility:** Medium. Adding multi-tenancy later means adding a `PS_CLEAN_businesses` table and a `business_id` column + RLS predicate across every table — a real migration, but a well-trodden one (it's exactly what Root Cafe's own tenant migrations, `0013`–`0017` in that repo, already did once).

---

## 3. Cleaners are not auth users in Core scope

**Decision:** `PS_CLEAN_cleaners` has a nullable `user_id` (references `auth.users`) but Core-tier cleaners are managed entirely by the admin — they don't log in, don't have a portal, and aren't required to have a `user_id` set.

**Why:** The brief's Core scope lists an admin panel for managing cleaners, but a "cleaner-facing mobile view" is explicitly listed as an out-of-scope 5-star feature. Making `user_id` nullable now means the column is already there — turning a cleaner into a logged-in user later is an `UPDATE`, not a migration.

**Reversibility:** High.

---

## 4. Booking conflict prevention: Postgres `EXCLUDE` constraint as the source of truth

**Decision:** Double-booking is prevented at the database level with a `tstzrange` column plus `EXCLUDE USING gist (cleaner_id WITH =, padded_range WITH &&) WHERE (status <> 'cancelled')`, using the `btree_gist` extension. Application code (a `SECURITY DEFINER` RPC, `ps_clean_create_booking`) is a courtesy layer that turns the resulting `23P01` exclusion-violation into a friendly "that slot just got taken" error — it is not itself the source of correctness.

**Implementation note discovered while applying the migration:** `padded_range` was first written as a `GENERATED ALWAYS AS (...) STORED` column, which Postgres rejected (`generation expression is not immutable`) — `timestamptz +/- interval` is classified STABLE, not IMMUTABLE, because the result can depend on the session timezone setting. Generated columns require IMMUTABLE expressions, so it's a plain column instead, maintained by a `BEFORE INSERT OR UPDATE` trigger (`ps_clean_set_booking_padded_range`) that runs before the EXCLUDE constraint is checked. Functionally equivalent; just not expressible as `GENERATED`.

**Why:** Race conditions between concurrent booking requests can't be reliably prevented by application-level checks (read-then-write always has a gap); a database constraint enforced by every write path, including any future admin override or script, is the only mechanism that can't be bypassed by a bug elsewhere in the app.

**Buffer/travel time modelling:** confirmed by research before implementing. `padded_range` widens the raw `[starts_at, ends_at)` range using two separate columns, `buffer_before_minutes` and `buffer_after_minutes` (copied onto the booking from the service at booking time), rather than one symmetric value — prep time before a job and travel time after it are different things and don't have to match. Most services will set `buffer_before_minutes = 0` and only use the after-buffer (travel to the next job), but the column exists for a service that genuinely needs setup time too.

**Reversibility:** Medium — changing the buffer model is a migration touching the generated column, but the exclusion-constraint approach itself is the standard, hard-to-outgrow solution for this problem.

---

## 5. Timezone handling

**Decision:** All instants (`starts_at`, `ends_at`, `created_at`, etc.) are stored as `timestamptz`. Working-hours are stored as plain `time` (e.g. `09:00`–`17:00`) with an explicit assumption that they mean **local time in `Europe/London`**, applied via `AT TIME ZONE 'Europe/London'` at the point slots are computed, never stored pre-converted to UTC.

**Why:** `timestamptz` is unambiguous for anything that already happened or is booked at a specific instant. Storing working hours as UTC-shifted times would silently break every March/October when BST/GMT flips, since "9am Monday" is a different UTC offset depending on the time of year — computing the conversion at query time keeps it correct across DST transitions automatically.

**Reversibility:** High — this is standard practice, not expected to change.

---

## 6. Payments: deposit-now + off-session-balance-charge, not manual-capture holds

**Decision:** `PS_CLEAN_customers` stores `stripe_customer_id` and `stripe_default_payment_method_id`; the deposit (or full amount, if a service has no deposit configured) is taken via a normal PaymentIntent with `setup_future_usage: 'off_session'` at booking time, and any remaining balance is charged off-session against the saved payment method closer to the job date.

**Why:** Researched before implementing (see the booking-conflicts/Stripe/SMS research task). A manual-capture ("authorize now, capture later") PaymentIntent was the other candidate, but card authorization holds expire in ~7 days for most UK card networks — unworkable for jobs booked weeks in advance, which this business explicitly needs. The deposit+off-session pattern has no such expiry since it holds a tokenized payment method, not a time-limited authorization.

**Reversibility:** Medium — switching models later means migrating away from a saved-payment-method flow, a real change to the checkout UI, but the underlying `PS_CLEAN_payments` table (typed `deposit`/`full`/`balance`/`refund`/`cancellation_fee`) doesn't need to change either way.

---

## 7. Bug found by the test agent and fixed: NULL-safe ownership checks

**What happened:** The dedicated test agent tasked with exercising the booking-conflict logic against the live database (per the brief's request for a "test agent" on exactly this code) found a real authorization bypass: `ps_clean_create_booking` and `ps_clean_cancel_booking` both checked ownership with a plain `<>` comparison against `ps_clean_current_customer_id()`. That function returns `NULL` for any caller with no matching `PS_CLEAN_customers` row (unauthenticated, or authenticated but not yet a customer). `anything <> NULL` evaluates to `NULL` in SQL, and PL/pgSQL's `IF` treats a `NULL` condition as **false** — so `if not ps_clean_is_admin() and p_customer_id <> ps_clean_current_customer_id()` silently never raised the exception for an unauthenticated caller, and the RPC ran to completion. The agent confirmed this live (before the fix): an unauthenticated `ps_clean_cancel_booking` call actually cancelled another customer's real booking.

**Fix (applied, migration `0007_fix_null_ownership_bypass.sql`):** both checks now read `(ps_clean_current_customer_id() is null or p_customer_id is distinct from ps_clean_current_customer_id())`, which is `NULL`-safe in both directions.

**Why this is worth calling out explicitly:** it's a concrete example of the brief's premise — that booking-conflict-adjacent logic is exactly where subtle, expensive bugs hide — paying off. The double-booking guarantee itself (the `EXCLUDE` constraint) tested sound with no issues; the bug was in the authorization layer sitting in front of it, which is a different class of mistake and one an automated correctness-only test suite could easily have missed if it only checked "does the RPC behave correctly for a valid authenticated customer" without also checking "what happens with no valid customer at all."

---

## 8. Bugs found by actually running the app in a browser/curl, and fixed

Per this project's own engineering rules (test in a real browser before calling UI work done), the app was launched with `pnpm dev` and driven with `curl` (no headless-Chromium binary was available in this environment — see the note in the final summary). Two real bugs surfaced immediately that no amount of `tsc`/`next build`/`eslint` passing had caught, because both are runtime-only failures:

**Bug A — Next.js 16 renamed the middleware convention file.** `middleware.ts` exporting `middleware()` (the Next.js ≤15 convention, and what every tutorial/training data still shows) is **silently never registered at all** under Next.js 16 — it renamed the file to `proxy.ts` and the export to `proxy()` (confirmed by checking `Root Cafe - App`, which already runs this Next.js version and uses `src/proxy.ts`). This wasn't a build error or a type error — the app built and ran fine, just with session-refresh, the Supabase magic-link code-exchange, and the `x-pathname` header all doing nothing. **Fix:** replaced `middleware.ts` with `src/proxy.ts` exporting `proxy()`. Every other app in this workspace that predates Next.js 16 should be checked before assuming `middleware.ts` works there either, if any of them upgrade.

**Bug B — infinite RLS recursion on `PS_CLEAN_admin_users`.** `ps_clean_is_owner`-shaped logic was originally written as a raw subquery directly inside the `admin_users write by owner` policy (`exists (select 1 from "PS_CLEAN_admin_users" a where ...)`) instead of going through a `SECURITY DEFINER` helper function. Because that policy is `for all` (which includes `SELECT`, not just writes), *any* `SELECT` against `PS_CLEAN_admin_users` — including the one the policy's own subquery issues — re-triggers the table's RLS, which evaluates the same self-referencing policy again: infinite recursion (`42P17`). Worse, `PS_CLEAN_business_settings`'s `owner write` policy was also `for all` and referenced `admin_users` the same way, which meant **even the fully public `business_settings public read` policy's `SELECT` dragged in the recursive check** via Postgres OR-ing multiple permissive policies together for the same command — so the homepage's business name silently fell back to its "Cleaning Company" default with the real error swallowed by `.maybeSingle()` returning null on failure. **Fix:** added `ps_clean_is_owner()` (`SECURITY DEFINER`, same pattern as `ps_clean_is_admin()`) and pointed both policies at it instead of the raw subquery — a `SECURITY DEFINER` function's internal queries run as its owner (the migration role, which has `BYPASSRLS`), so it never re-enters RLS at all.

**Takeaway for any future `for all` policy in this schema:** if its `USING` clause queries the same table the policy is attached to, or any table whose own policies could recurse back, that check MUST go through a `SECURITY DEFINER` function, never a raw subquery — exactly the pattern `ps_clean_is_admin()` already established, which is why it never had this problem.

---

## 9. Magic-link sign-in emails are sent by PS Cleaning's own code, not Supabase's built-in email

**What happened:** the user noticed a PS Cleaning sign-in email arrived reading "Sign in to Root Café". `requestMagicLinkAction` originally called `supabase.auth.signInWithOtp()`, which sends Supabase Auth's own built-in "Magic Link" email template. That template is configured once per Supabase **project** (Dashboard > Authentication > Email Templates) — not per app — and Root Café's app had already customized it for itself. Since PS Cleaning shares this Supabase project (see decision #1), every app's `signInWithOtp()` call was sending the same Root-Café-branded email.

**Decision:** don't touch that shared template — changing it to suit PS Cleaning would rebrand Root Café's real, live sign-in emails, which is exactly the kind of cross-app blast radius this project must never have. Instead, `requestMagicLinkAction` now calls `supabase.auth.admin.generateLink({ type: "magiclink", ... })` via the service-role client — this creates the same PKCE magic-link token as `signInWithOtp` but sends nothing — and PS Cleaning emails the resulting `action_link` itself via `sendMagicLinkEmail` in `lib/notify.ts`, using its own subject/branding through Resend, same as every other PS Cleaning notification.

**Why this is the right general pattern for a shared-Supabase-project app:** anything configured at the project level rather than the row/table level (Auth email templates, Auth providers, project-wide settings) is out of bounds for the same reason `PS_CLEAN_`-prefixing tables is required — it isn't namespaced per app, so changing it changes it for everyone. The fix here generalizes: whenever Supabase Auth's own emails would be needed (password reset, email-change confirmation, etc.), the same `generateLink()` + custom-send approach should be used rather than the built-in triggered email, since Core scope has no such flows to touch — but if the Growth/Pro roadmap ever adds one, use `admin.generateLink()` for it too rather than relying on the shared template.

**Reversibility:** High — this only changed how the link is generated and delivered; the callback/session-exchange handling in `src/lib/supabase/middleware.ts` (via `proxy.ts`) is unchanged and works identically either way.

---

## 10. Stripe: same shared test account as Root Cafe App, on user direction

**Decision:** `.env.local` uses the same Stripe test-mode keys (`acct_1TrzfLFkpzs5V6yx`) that `Root Cafe - App` uses, per explicit user instruction to look there for test credentials. Confirmed via that app's own `.env.local` and via `stripe config --list` on this machine, which is already authenticated to the same account.

**Webhook secret is NOT copied from Root Cafe as-is.** A `STRIPE_WEBHOOK_SECRET` is scoped to whichever endpoint URL it was issued for — Root Cafe's is tied to its own registered production/dev endpoint and would silently fail to verify PS Cleaning's events. Used `stripe listen --print-secret` instead (same authenticated CLI), which returns the *local-forwarding* secret — valid only while running `stripe listen --forward-to http://localhost:3000/api/webhooks/stripe` for local testing. **Before this app is ever deployed, it needs its own webhook endpoint registered in the Stripe dashboard and the secret that registration issues** — reusing the local-dev value in production would not verify real events.

**Why this is different from the Supabase decision, and worth flagging even though it was explicitly directed:** a Postgres table can be namespaced (`PS_CLEAN_` prefix) so two businesses' data cleanly coexists in one database with no risk of mixing them up. Stripe has no equivalent namespacing — every Customer, PaymentIntent, and charge PS Cleaning creates lives in the *same* Stripe account as Root Café's real transactions, distinguishable only by the `metadata.ps_clean_*` fields this app already sets on everything it creates (see `lib/actions/booking.ts`). That's a fine, reversible setup for test-mode development, but two genuinely separate businesses sharing one Stripe account for **live** payments would mix their real financial/tax records together, which most accountants (and Stripe's own ToS expectations around what a single account represents) would flag. Treat this as a development convenience only — a dedicated Stripe account is a prerequisite before this business takes a real card payment, not just a "nice to have" the way the shared Supabase project is.

**Reversibility:** High for now (test mode, no real money moved) — but switching to a dedicated account later just means swapping the three env vars and registering a new webhook endpoint; no data migration, since nothing in `PS_CLEAN_*` tables stores anything Stripe-account-specific beyond IDs that would simply be regenerated.

**This actually bit us once already:** two real test bookings got charged successfully on Stripe's side while testing locally, but stayed stuck at `status = 'pending_payment'` in the database, because nothing was running `stripe listen` to forward webhook events to `localhost` — Stripe has nowhere else to deliver them. Manually reconciled those two bookings (matched their PaymentIntents' actual `succeeded` status via the Stripe API and applied the same update the webhook would have). Added `pnpm stripe:listen` (see `package.json` and `README.md`) as the fix going forward — it needs to be running in a second terminal any time a payment is being tested locally, not just once at setup.

---

## 11. System-initiated writes use the service client directly, never the customer-facing RPCs

**What happened:** the NULL-safe ownership fix in decision #7 correctly closed the unauthenticated-impersonation hole in `ps_clean_cancel_booking`, but it had a side effect nobody had reason to check at the time: the Stripe webhook's own call to that same RPC (to free a slot when a payment fails) started failing too. `ps_clean_is_admin()` and `ps_clean_current_customer_id()` both key off `auth.uid()`, which is `NULL` for a service-role request — there's no signed-in user to be. Confirmed live: `ps_clean_cancel_booking` called with the service-role key against a real booking returned `42501 Not your booking`. This wasn't a hypothetical — it was live-tested against real bookings from this session's own testing (see below) and would have silently broken the webhook's auto-cancel-on-payment-failure path in production.

**Decision:** system-initiated cancellations (the Stripe webhook, and the new stale-booking cleanup) go through a direct table update via the service-role client (`lib/bookings.ts` → `cancelBookingAsSystem`), not the `ps_clean_cancel_booking` RPC. `service_role` already has `BYPASSRLS` at the Postgres role level — every other write the webhook makes (updating payment status, confirming a booking, saving a payment method) already relies on exactly this, so routing cancellation through it too is consistent, not a special case. The RPC itself is unchanged and still correctly customer/admin-gated — it's simply the wrong tool for a call with no signed-in user behind it.

**General rule this establishes:** the `ps_clean_*` RPCs in `0004_functions.sql` are the customer-facing surface and should stay strictly ownership-checked. Anything system-initiated (webhooks, cron jobs, admin scripts) should write directly via the service-role client instead of trying to satisfy those RPCs' auth checks — attempting to make an RPC serve both a real user's request and a system process's request is exactly how decision #7's fix broke something else that looked unrelated.

**How this was caught:** while building the abandoned-checkout cleanup (see below), reconciliation of this session's own test bookings surfaced two that had actually succeeded on Stripe but stayed `pending_payment` in the database (see decision #10's addendum) — investigating why exposed this RPC/service-role gap before it could cause the same silent failure for the new cleanup job.

---

## 12. Abandoned-checkout cleanup: `/api/cron/cancel-stale-bookings`

**Decision:** any booking still at `pending_payment` 30 minutes after creation gets auto-cancelled, freeing its slot. Closes the gap the Stripe webhook can't: a customer who abandons checkout without Stripe ever generating a payment-failed event (closed the tab, never entered card details) leaves no event for the webhook to react to, so the booking — and the slot it holds — would otherwise sit there forever.

**Why 30 minutes:** long enough that a customer slowly filling in card details isn't at risk of getting cancelled out from under them, short enough that a genuinely abandoned slot doesn't block real bookings for hours. Not a value with strong justification behind it — a reasonable first default, easy to tune later (`STALE_AFTER_MINUTES` in the route file) once there's real usage data on how long checkout actually takes people.

**Needs the same post-deployment scheduling as the other two cron routes** (see ROADMAP.md) — it's built and manually verified working (see decision #11), just not on an actual timer yet.

---

## 13. Cloudflare Workers deployment: infrastructure built, but currently blocked by an upstream bug

**What was built:** `wrangler.jsonc`, `open-next.config.ts`, `custom-worker.ts` (with a `scheduled()` handler dispatching to the three `/api/cron/*` routes on Cloudflare's own native Cron Triggers — cleaner than Supabase pg_cron+pg_net since it needs no external URL dependency at all), and a `sharp` stub (`stubs/sharp/`, wired via `pnpm.overrides`) since Next.js always pulls in `sharp` for its image optimizer even though this app doesn't use `next/image` — `images.unoptimized: true` alone didn't stop `@opennextjs/cloudflare` from trying to bundle it, and esbuild can't bundle its native `.node` binary for a Workers target.

**Current status: deployed, but every route 500s.** Root cause identified precisely: Next.js's `NextServer.getMiddlewareManifest()` (`node_modules/next/dist/server/next-server.js`) does a raw `require(this.middlewareManifestPath)` — a different code path from the `loadManifest()`/`evalManifest()` functions that `@opennextjs/cloudflare`'s `inlineLoadManifest` patch specifically targets and rewrites for Workers compatibility. This raw `require()` isn't covered by that patch, so it survives into the bundled worker and throws `Dynamic require of ".../middleware-manifest.json" is not supported` on every single request, regardless of whether the app has any actual middleware/proxy file (confirmed by testing with `proxy.ts` fully removed — identical failure). This is present in `@opennextjs/cloudflare@1.20.6` (the latest published version at time of writing) against `next@16.3.4` (also latest) — a genuine current upstream incompatibility between the newest versions of both packages, not a mistake in this app's configuration. Root Cafe App's own live production deployment (`orderaheadapp.co.uk`) was checked directly and returns `200 OK`, ruling out "this combination is universally broken" — something about their specific build/deploy path avoids triggering this, not yet identified (a `pnpm-workspace.yaml` difference was tried as one hypothesis and ruled out — adding one made no difference).

**Not fixed, on purpose:** patching this would mean either (a) editing generated code inside `node_modules` (not reproducible — gone on the next `pnpm install`), or (b) forcing Next's `minimalMode` (which `getMiddlewareManifest()` itself checks and skips this exact call when true) — but `minimalMode` is an internal flag meant for a specific serverless invocation shape where routing is pre-resolved externally, and flipping it without understanding what else depends on it risks silently breaking routing/caching elsewhere. Neither is a change worth making blind under time pressure; this needs either an upstream fix/patch release from the OpenNext team, or a deliberate, tested decision to pin an older combination of `next`/`@opennextjs/cloudflare` known to work together.

**Fallback attempted: Vercel.** Next.js's own platform, zero adapter needed, would sidestep this entirely. The Vercel CLI is installed and `vercel deploy --temporary` (a zero-config, no-account-needed temporary deployment) was attempted, but the CLI wasn't authenticated on this machine and the command blocked on an interactive OAuth device-code flow (`vercel.com/oauth/device?user_code=...`) that a non-interactive session can't complete — it timed out waiting rather than deploying anything. This needs one human click to unblock (visit the link, confirm) — genuinely a one-time, low-friction ask, just not something completable autonomously here.

**Resolution: deployed to Vercel instead.** The user completed the one-time interactive login this session couldn't do itself; deployment then worked immediately with zero adapter/compatibility issues, confirming the app itself was never the problem. Live at **https://ps-clean-booking.vercel.app**. Environment variables were set via `vercel env add` with explicit `--type config`/`--type secret` flags — piping values via stdin without `--value`/`--type` caused Vercel's CLI to prompt interactively for credential-shaped values (it flags anything matching common secret patterns and asks whether to expose or hide it), and those unanswered prompts silently consumed the next loop iteration's piped input, corrupting several values before this was caught by inspecting `vercel env ls` output and re-done one at a time.

**Vercel Cron vs the Cloudflare Workers Cron Triggers this pass originally built:** Vercel's cron always calls via **GET** (not POST), so all three `/api/cron/*` routes now export both `GET` and `POST` from a shared handler — `GET` for Vercel Cron (which also auto-attaches `Authorization: Bearer <value>` for any env var literally named `CRON_SECRET`, matching what these routes already expected), `POST` for everything else (manual calls, and the still-committed-but-unused Cloudflare `custom-worker.ts` scheduled handler, kept in the repo in case Cloudflare deployment becomes viable later once the upstream bug above is fixed). Schedules are **daily**, not the original 15-minute/hourly cadence, since Vercel's free Hobby tier only supports daily cron schedules — `cancel-stale-bookings` at 03:00 UTC, `charge-balances` at 06:00 UTC, `send-reminders` at 08:00 UTC (see `vercel.json`). This means an abandoned checkout can now hold its slot for up to ~24h rather than ~30 minutes before cleanup runs — an acceptable trade-off for now, revisit if upgrading past the Hobby tier.

**Where this leaves things:** the app is live and fully functional. The Cloudflare investigation above is preserved as-is since the infrastructure (and the root-cause finding) may be useful again once the upstream `@opennextjs/cloudflare`/Next.js incompatibility is fixed — nothing about it was wasted effort, it's just not the active deployment target.

---

## 14. Pro tier: cleaner-facing mobile view, business reports, installable PWA

**What was built:** three of the four Pro-tier roadmap items (multi-tenant architecture stays deliberately deferred — see decision #2, it's a business call, not something to build speculatively).

- **Cleaner portal** (`/cleaner`): cleaners sign in with the same magic-link flow as customers/admins (`requestMagicLinkAction`, reused as-is). `requireCleaner()` (`lib/auth.ts`) links a cleaner's first login by email — matching decision #3's whole point in making `user_id` nullable: turning a cleaner into a logged-in user is an `UPDATE` on first login, not a migration or a signup form. Cleaners see today's jobs, a job detail page with the customer/address/notes, a "Mark job complete" button (`ps_clean_cleaner_complete_booking`, a `SECURITY DEFINER` RPC rather than a direct RLS `UPDATE` policy, since RLS can't restrict *which columns* change — a cleaner should only ever flip `confirmed` → `completed` on their own job, nothing else), and before/after photo upload to a new private Storage bucket (`ps-clean-booking-photos`), visible to the customer on their own completed-booking page too.
- **Business reports** (`/admin/reports`): total revenue (from succeeded `PS_CLEAN_payments`, refunds subtracted), revenue by month, popular services, and repeat-customer rate. Computed by fetching the (currently small) dataset and aggregating in JS, matching the existing style of every other admin page in this codebase (e.g. the admin overview page) rather than introducing a new aggregation RPC for a single-tenant app's dataset size.
- **Installable PWA**: `public/manifest.webmanifest`, a minimal `public/sw.js`, and app icons generated by `scripts/generate-icons.mjs` — hand-rolled raw PNG bytes via Node's built-in `zlib` rather than pulling in `sharp` (deliberately stubbed out for the Cloudflare build, decision #13) or any other native image dependency just for a few solid-color icons. The service worker is deliberately narrow: it only ever caches this app's own static manifest/icon files, never any page or API route — this is a live, per-user, auth-gated booking system, not something that should behave "offline-first."

**Two real bugs found while building and testing this (per this project's established practice of testing security-sensitive changes live against the real database rather than trusting code review — see decisions #7, #11):**

**Bug A — magic-link sign-in never actually worked end-to-end, for anyone.** `requestMagicLinkAction` emailed `data.properties.action_link` from `admin.generateLink()`, which points at Supabase's own `/auth/v1/verify` endpoint. With no browser-side PKCE code challenge behind it (this link is generated entirely server-side, no browser ever called `signInWithOtp()`), that endpoint redirects back with the session in a URL **fragment** (`#access_token=...`), not a `?code=` query param — confirmed directly via `curl -D -` against the real verify URL. Fragments never reach the server at all, so `/auth/callback`'s `exchangeCodeForSession(code)` always saw `code` as `null` and redirected to `/login?error=auth`. This had been silently broken since decision #9 introduced the custom-email approach — nothing in this codebase's own testing had ever clicked a real generated link all the way through with a fresh `curl` session (cookie state was always coincidentally present some other way, e.g. an already-authenticated browser session, or the OAuth-linked account testing earlier in this session). **Fix:** `requestMagicLinkAction` now builds its own link using `data.properties.hashed_token` pointed at `/auth/callback`, and the callback route calls `supabase.auth.verifyOtp({ token_hash, type })` instead of `exchangeCodeForSession(code)` — Supabase's own documented pattern for a self-sent auth email, and it sidesteps the implicit-vs-PKCE distinction entirely. Verified end-to-end via `curl` for all three login surfaces (customer, admin, and the new cleaner portal), including the first-login-links-by-email path for a cleaner.

**Bug B — a cleaner could upload/read/overwrite another cleaner's booking photos.** The bucket-scoped RLS policies in migration 0020 (`bucket_id = 'ps-clean-booking-photos' and exists (...ownership check...)`) looked correct and were reviewed carefully, but this shared Supabase project (decision #1) has a **pre-existing, project-wide "Allow all" policy set on `storage.objects`** (`with_check: true` for INSERT/UPDATE/DELETE, `using: true` for SELECT, role `public`) that predates PS Cleaning and applies across every bucket in the project. Postgres RLS ORs all *permissive* policies together, so that blanket policy silently made every one of PS Cleaning's own bucket-scoped policies moot. Confirmed live: a direct REST call as cleaner "Marcus" successfully uploaded a file into cleaner "Jane"'s booking-photo folder, and could read a photo from her booking, both of which should have been rejected. **Not fixed by touching the shared policy** — other, unrelated apps in this project may depend on it being permissive (same reasoning as the "Flagged for review" items below). **Fix (migration 0022):** added `RESTRICTIVE` policies (`AS RESTRICTIVE`, one each for INSERT/SELECT/UPDATE/DELETE) scoped with `bucket_id <> 'ps-clean-booking-photos' or <ownership check>`. Postgres ANDs restrictive policies against the OR'd permissive set, so this genuinely enforces ownership within PS Cleaning's own bucket without touching, weakening, or even referencing the shared "Allow all" policy — a no-op for every other bucket in the project (the `bucket_id <> '...'` half is always true for them), and a real gate for this one. Re-verified live after the fix: the same cross-cleaner upload/read attempts now correctly return an RLS-violation error and a "not found" (object doesn't exist, from the attacker's point of view) respectively, while each cleaner's own upload/read continued to work.

**General rule this establishes, worth checking before trusting any RLS policy in this shared project again:** a policy that looks airtight in isolation can still be silently bypassed by a permissive policy on the same table from a *different, unrelated app* sharing this Postgres instance — RLS policies are OR'd project-wide, not per-app, regardless of how careful this app's own migration is. `RESTRICTIVE` policies scoped by an app-specific discriminator (`bucket_id`, or an equivalent narrowing column) are the fix, not touching the other policy. Worth checking `pg_policies` for existing permissive policies on any table this app newly enables RLS on, if that table (or in this case, the whole `storage.objects` table) could already carry other apps' policies.

**Reversibility:** High for both. The auth fix only changed how the link is built and verified, not the session/cookie mechanics elsewhere. The storage fix is purely additive (four new policies); removing them would simply restore the (bad) status quo, not break anything new.

---

## 15. `RESEND_API_KEY` had never actually been set to a real value — login was still broken in production after decision #14's fix

**What happened:** immediately after deploying decision #14's magic-link fix, the user tried it for real on their phone and hit a production error screen: `Minified React error #441`, which decodes (per React's own error-codes list) to "An error occurred in the Server Components render. The specific message is omitted in production builds..." — Next's generic redaction of a real thrown error, not a React bug itself. Pulling Vercel's function logs (`vercel logs`) showed the actual underlying error: `Error: Email isn't configured (RESEND_API_KEY missing)`.

Checking turned up that `RESEND_API_KEY` (and all three `TWILIO_*` vars) were **empty-string placeholders in `.env.local`**, not a revoked or expired credential — and were never set in Vercel at all. This had nothing to do with today's changes: every email this app sends (magic-link sign-in, booking confirmations, reminders, waitlist notifications) has been silently broken since the original deployment. It went unnoticed through all of this session's own testing because every login test (decision #14 included) generated its magic-link token directly via a script calling `admin.generateLink()`, which bypasses `sendMagicLinkEmail`/`sendEmail` entirely — the actual Resend call path was never exercised until a real user clicked the real button.

**Fix:** the user provided a real Resend API key. Checking `GET /domains` on that Resend account showed its only two verified sending domains belong to the user's *other* apps — `orderaheadapp.co.uk` (Root Café) and `maiseydaysdoggrooming.co.uk` — neither of which PS Cleaning should send from without misrepresenting which business an email is actually from (the same identity-bleed problem decision #9 already flagged for the shared Supabase Auth email template). Rather than silently borrowing one of those domains, `NOTIFY_FROM_EMAIL` now uses Resend's own sandbox sender (`onboarding@resend.dev`), which works without any domain verification. Wired into `.env.local` and Vercel production (`RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`), then verified for real: a live email was sent and received via the real Resend API, and the resulting magic link was clicked through end-to-end against production, landing on a real authenticated `/account` page.

**Still open:** `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` remain empty placeholders — SMS notifications (reminders, confirmations) are still non-functional in production. Lower priority than email since login doesn't depend on it, but the same class of gap. **PS Cleaning also has no dedicated verified sending domain** — `onboarding@resend.dev` is fine for testing/demo but should not be the permanent sender once this goes in front of real customers (Resend sandbox senders are rate-limited and look unprofessional in an inbox); a proper domain + DNS verification is a pre-launch task, not a code change.

**Reversibility:** High. Swapping `NOTIFY_FROM_EMAIL` to a dedicated verified domain later is a one-line env var change, no code change needed.

---

## 16. Cleaner invoicing: real numbered documents, not just a revenue log

**What was there before:** `PS_CLEAN_cleaner_payouts` (Growth tier) recorded a manually-triggered summary — booking count, hours, and *customer-facing revenue* — per cleaner per period. It had no concept of what a cleaner is actually paid (which is rarely the same as the job's price to the customer), no line items, no invoice numbering, and no persistent document a cleaner could be shown or reference later.

**Decision:** built a proper invoicing layer on top, rather than extending the payouts table in place:

- `PS_CLEAN_cleaners` gained `pay_rate_type` (`percentage` | `hourly` | `fixed_per_job`) and `pay_rate_value` — a cleaner's actual pay rate, editable from their admin profile. `percentage` is a plain 0-100 number; the other two are pence, consistent with every other money column in this schema.
- `PS_CLEAN_cleaner_invoices` + `PS_CLEAN_cleaner_invoice_items`: a real, numbered (`INV-00001`, via a Postgres sequence), stored document per cleaner per period, with one line item per completed job, computed from that cleaner's pay rate at generation time — not the job's customer price.
- A booking can only ever appear on one invoice, enforced by a partial unique index on `invoice_items.booking_id` (`where booking_id is not null`), not just application logic — the same "constraint is the real guarantee, app code is a courtesy layer" pattern as the booking-conflict `EXCLUDE` constraint (decision #4).
- **Voiding an invoice deletes its line items** (not just flips a status flag) — found necessary during testing: without this, the unique constraint above would permanently block a mistakenly-invoiced job from ever being paid out on a corrected invoice. The invoice header (number, period, total) stays as an audit trail; only the itemized breakdown is released. Verified live: voided an invoice, confirmed the underlying job could immediately be re-invoiced on a fresh one.
- **The cleaner can see their own invoices** (`/cleaner/invoices`), read-only via RLS (`cleaner_invoices read own` / `cleaner_invoice_items read own`) — this is explicitly "an invoice *for* the cleaner, showing what they're owed," not just an internal admin record, so it belongs in the cleaner portal alongside today's jobs. Confirmed live that a cleaner's own session can read their invoice but a direct write attempt (e.g. trying to mark it paid themselves) is silently no-op'd by RLS, same as any other read-only policy in this schema.
- The old `PS_CLEAN_cleaner_payouts` table and `/admin/payouts` page are left in place untouched (existing historical records aren't deleted) but the admin nav now points at `/admin/invoices` instead — payouts is superseded, not removed.

**Why not extend the payouts table instead of adding two new ones:** the payouts row shape (one summary row, no line items, revenue not payout amount) couldn't represent "what's actually owed, broken down by job" without a breaking schema change to a table that might already have real historical rows by the time this was built — a clean new pair of tables is more reversible and the old data is never at risk.

**Reversibility:** Medium — the pay-rate columns and new tables are purely additive. Removing the invoicing feature later would just mean hiding the nav link again; nothing else in the schema depends on it.

---

## 17. Cleaner portal: week schedule, customer database, earnings summary

**What was added:** `PS_CLEAN_recurring_bookings` had no cleaner read policy at all before this (only the owning customer or an admin could see a recurring series) — added `recurring_bookings read own as cleaner` (direct `cleaner_id` column check, same shape as the existing `bookings read own as cleaner` policy from migration 0021, no recursion risk). Everything else needed for this — a week's worth of bookings, which customers a cleaner has served, their own invoices — was already readable via existing RLS policies from migrations 0020/0021, so no other schema change was needed.

- **`/cleaner/schedule`**: a Monday-first week view (prev/next navigation via a `?week=` date-key param) grouping the same bookings the Today page already queries, just widened to a 7-day window, plus a "Your regular customers" list from the newly-readable recurring bookings. Jobs generated from a recurring series get a small "Recurring" badge.
- **`/cleaner/customers`**: every customer a cleaner has ever had a booking with, aggregated client-side from their own booking history (name, address, phone, job count, last visit) — the same fetch-then-aggregate style used everywhere else in this codebase for small per-tenant datasets (e.g. the admin reports page), not a new RPC.
- **Earnings summary** (top of `/cleaner/invoices`): "this week" / "this month" totals computed directly from completed bookings × the cleaner's pay rate — deliberately *not* derived from invoice `issued_at` dates, since a job earned this week may not be invoiced yet, and an invoice's period rarely lines up with a calendar week or month anyway. This meant extracting the pay-rate math (`computePayable`) out of `lib/actions/invoices.ts` into its own module, `lib/pay-rate.ts` — a `"use server"` file may only export async server actions, so the shared calculation couldn't stay there once something outside an action needed to call it.

**Found and left alone during testing:** while inserting a test booking to verify the schedule page, discovered `jane@example.com` (one of the demo cleaner accounts from earlier sessions) also has a real `PS_CLEAN_customers` profile ("Fred") with a genuine confirmed upcoming booking against the new Rug Cleaning service — not something this session created. Left it untouched rather than force through the original cleanup (which failed on exactly this foreign-key reference) — a customer/cleaner sharing one login is unusual but not invalid, and deleting real, currently-confirmed booking data to tidy up an unrelated test would be the wrong tradeoff.

**Reversibility:** High. All additive — one new RLS policy, two new pages, a summary section, and a moved (not duplicated) pure function.

---

## Flagged for review (not fixed — outside this app's ownership)

Running Supabase's security advisor against the shared project surfaced two pre-existing, project-wide items unrelated to any `PS_CLEAN_*` object, left alone because fixing them could affect other apps sharing this project without their owners' knowledge:

- **`btree_gist` extension installed in the `public` schema**, not a dedicated `extensions` schema. This migration needed `btree_gist` (for the booking overlap `EXCLUDE` constraint) and installed it the same way other extensions in this project already are — moving it to its own schema is a good practice but is a project-wide cleanup, not a PS Cleaning change.
- **Leaked-password protection is disabled** at the Supabase Auth level for the whole project (checks new passwords against HaveIBeenPwned). This is a project-wide Auth setting, not something PS Cleaning's own tables/policies control — worth enabling, but it's the project owner's call since it affects every app's sign-up flow, not just this one.
- **`storage.objects` has a project-wide "Allow all" permissive policy** (`with_check`/`using` = `true` for every command, role `public`) that lets any authenticated (or even anonymous) request read/write/delete any file in any bucket in this shared project — found while building the cleaner photo-upload feature (decision #14, Bug B). PS Cleaning added `RESTRICTIVE` policies to genuinely protect its own bucket without touching this, but the underlying policy itself is still there, still project-wide, and presumably still relied on by whichever other app(s) in this project use unrestricted storage access (candidates: the bare `photos` table's bucket, or others). Worth the project owner reviewing whether every app sharing storage here actually needs that, but not PS Cleaning's call to change.

Everything else the advisor flagged (`SECURITY DEFINER` functions callable by `anon`/`authenticated`) is expected and intentional for `ps_clean_*` functions — see DECISIONS.md #4 and the RLS design in `0005_rls.sql` — and matches the same pattern already used by other apps' functions in this project (`is_staff_for`, `buster_is_owner`, etc.).
