import { getCurrentBusiness } from "@/lib/business";

export const dynamic = "force-dynamic";

// Hand-built SVG rather than next/og's ImageResponse — this app's
// pnpm.overrides stubs out `sharp` entirely (see stubs/sharp/index.js) so a
// Cloudflare Workers build doesn't choke on its native bindings, and that
// stub breaks ImageResponse everywhere it's used, Vercel included (this
// app's actual production target — see DECISIONS.md #13, the Cloudflare
// path is currently dormant). Plain SVG markup needs no image-encoding
// library at all, so it works identically in dev and in production.
export async function GET() {
  const business = await getCurrentBusiness();
  const initial = business.business_name.trim().charAt(0).toUpperCase() || "P";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="${business.brand_color}" />
  <text x="16" y="16" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="18" font-weight="700" fill="#ffffff">${initial}</text>
</svg>`;

  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
}
