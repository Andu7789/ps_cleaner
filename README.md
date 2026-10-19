# PS Cleaning — Booking Platform

Next.js (App Router) + Supabase booking platform for a cleaning company. Customers book without an account and are emailed a booking reference; nothing is paid online (see DECISIONS.md #26). See `/DECISIONS.md` for architecture decisions and `/ROADMAP.md` for what's built vs. planned.

**Live:** https://psclean.site (also reachable at the underlying https://ps-clean-booking.vercel.app) — deployed via `vercel deploy --prod` from this repo, not connected to git auto-deploy. Run `vercel deploy --prod` again after pulling changes to update it. See DECISIONS.md #13 for why this is on Vercel rather than the originally-attempted Cloudflare Workers deployment (`wrangler.jsonc`/`custom-worker.ts` are still in the repo for when that becomes viable), and DECISIONS.md #21 for the custom domain + email sending domain setup.

## Local development

```bash
pnpm install
pnpm dev
```

## Environment variables

See `.env.example` for the full list. At minimum you need the Supabase keys to run the booking flow end-to-end; email/SMS (`RESEND_API_KEY`, `TWILIO_*`) are optional until you need notifications to actually send.

## Scripts

- `pnpm dev` — dev server
- `pnpm test` / `pnpm test:watch` — Vitest
- `pnpm type-check` — `tsc --noEmit`
- `pnpm lint` — ESLint
- `pnpm build` — production build
