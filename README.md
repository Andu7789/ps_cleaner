# PS Cleaning — Booking Platform

Next.js (App Router) + Supabase + Stripe booking platform for a cleaning company. See `/DECISIONS.md` for architecture decisions and `/ROADMAP.md` for what's built vs. planned.

**Live (testing/demo):** https://ps-clean-booking.vercel.app — deployed via `vercel deploy --prod` from this repo, not connected to git auto-deploy. Run `vercel deploy --prod` again after pulling changes to update it. See DECISIONS.md #13 for why this is on Vercel rather than the originally-attempted Cloudflare Workers deployment (`wrangler.jsonc`/`custom-worker.ts` are still in the repo for when that becomes viable).

## Local development

```bash
pnpm install
pnpm dev
```

**Also run, in a second terminal, whenever you're testing a real payment:**

```bash
pnpm stripe:listen
```

Without this, Stripe still processes the card payment, but the app never finds out — the webhook that flips a booking from `pending_payment` to `confirmed` has nowhere to reach on `localhost`. A booking can then show as unpaid in `/account` or `/admin` even though the card was genuinely charged (test-mode). This bit us once already; see DECISIONS.md #10.

`pnpm stripe:listen` prints a `whsec_...` value the first time you run it under a new Stripe CLI login — copy it into `.env.local`'s `STRIPE_WEBHOOK_SECRET` if it differs from what's already there.

## Environment variables

See `.env.example` for the full list. At minimum you need Supabase and Stripe test keys to run the booking flow end-to-end; email/SMS (`RESEND_API_KEY`, `TWILIO_*`) are optional until you need notifications to actually send.

## Scripts

- `pnpm dev` — dev server
- `pnpm stripe:listen` — forwards Stripe webhook events to your local dev server (see above)
- `pnpm test` / `pnpm test:watch` — Vitest
- `pnpm type-check` — `tsc --noEmit`
- `pnpm lint` — ESLint
- `pnpm build` — production build
