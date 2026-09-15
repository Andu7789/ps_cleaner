import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Applied to every response. Deliberately the set that can't break a working
// page (a full Content-Security-Policy needs testing against Stripe.js and
// its payment iframes before it can be switched on safely) — these only
// constrain what other sites and the browser may do with our responses.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Next's built-in image optimizer bundles `sharp`, which needs native
  // Node bindings Cloudflare Workers can't run (esbuild fails trying to
  // bundle the .node binary). Not a real loss — nothing in this app uses
  // next/image yet, so there's no optimization to disable in practice.
  images: {
    unoptimized: true,
  },
};

// Enables Cloudflare bindings (env vars, KV, etc.) when running `next dev` locally.
initOpenNextCloudflareForDev();

export default nextConfig;
