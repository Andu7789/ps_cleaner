// Wraps the Next.js worker OpenNext generates (`.open-next/worker.js`, built
// by `opennextjs-cloudflare build` — see package.json's cf:deploy script) so
// it can also export a `scheduled` handler, which OpenNext's own generated
// worker doesn't have. This is the officially documented "custom worker"
// pattern: https://opennext.js.org/cloudflare/howtos/custom-worker
//
// This file is deliberately excluded from tsconfig.json's own file list
// (see its "exclude") — it imports "./.open-next/worker.js", which only
// exists after next build has already run, and Next's own internal
// type-check (part of next build) resolves the whole tsconfig file list,
// including root-level files, before .open-next is generated. Excluding it
// from tsc's file list doesn't stop wrangler's own esbuild bundler from
// bundling it later, once .open-next genuinely exists — same pattern Root
// Cafe App already uses in this workspace.
//
// The three scheduled routes are called in-process (handler.fetch, not a
// real network request) — no separate HTTP hop, no separate URL to keep in
// sync, and CRON_SECRET never leaves the worker.
import { default as handler } from "./.open-next/worker.js";

const CRON_ROUTES: Record<string, string> = {
  "*/15 * * * *": "/api/cron/cancel-stale-bookings",
  "0 * * * *": "/api/cron/send-reminders",
  "0 6 * * *": "/api/cron/charge-balances",
};

const worker = {
  fetch: handler.fetch,

  async scheduled(controller: { cron: string }, env: Record<string, string | undefined>, ctx: ExecutionContext) {
    const path = CRON_ROUTES[controller.cron];
    if (!path) return;

    const cronSecret = env.CRON_SECRET;
    if (!cronSecret) return;

    const origin = env.NEXT_PUBLIC_SITE_URL ?? "https://ps-clean-booking.workers.dev";
    const request = new Request(new URL(path, origin), {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    ctx.waitUntil(handler.fetch(request, env, ctx));
  },
};

export default worker;

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
