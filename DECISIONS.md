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

## Flagged for review (not fixed — outside this app's ownership)

Running Supabase's security advisor against the shared project surfaced two pre-existing, project-wide items unrelated to any `PS_CLEAN_*` object, left alone because fixing them could affect other apps sharing this project without their owners' knowledge:

- **`btree_gist` extension installed in the `public` schema**, not a dedicated `extensions` schema. This migration needed `btree_gist` (for the booking overlap `EXCLUDE` constraint) and installed it the same way other extensions in this project already are — moving it to its own schema is a good practice but is a project-wide cleanup, not a PS Cleaning change.
- **Leaked-password protection is disabled** at the Supabase Auth level for the whole project (checks new passwords against HaveIBeenPwned). This is a project-wide Auth setting, not something PS Cleaning's own tables/policies control — worth enabling, but it's the project owner's call since it affects every app's sign-up flow, not just this one.

Everything else the advisor flagged (`SECURITY DEFINER` functions callable by `anon`/`authenticated`) is expected and intentional for `ps_clean_*` functions — see DECISIONS.md #4 and the RLS design in `0005_rls.sql` — and matches the same pattern already used by other apps' functions in this project (`is_staff_for`, `buster_is_owner`, etc.).
