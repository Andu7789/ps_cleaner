import { getCurrentBusiness } from "@/lib/business";

// A separate installable app for cleaners. The site-wide manifest starts at the
// customer homepage, so installing from a cleaner page used to open the public
// site. This one starts at the cleaner screen and stays inside /cleaner.
export async function GET() {
  const business = await getCurrentBusiness();
  const icon = business.icon_url ?? business.logo_url;

  const manifest = {
    id: "/cleaner",
    name: `${business.business_name} Cleaner`,
    short_name: "Cleaner",
    description: `Jobs and schedule for ${business.business_name} cleaners.`,
    start_url: "/cleaner",
    scope: "/cleaner",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: business.brand_color,
    icons: icon
      ? [
          { src: icon, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
        ]
      : [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
