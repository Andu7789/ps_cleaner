import type { MetadataRoute } from "next";
import { getCurrentBusiness } from "@/lib/business";

// Replaces the old static public/manifest.webmanifest — every business
// needs its own PWA name/theme color, not one fixed "PS Cleaning" install
// prompt regardless of which instance the visitor is actually on. Icons
// stay the shared defaults unless a business has its own logo_url set (see
// layout.tsx's generateMetadata for the same fallback), since generating
// distinct icon files per business isn't something this can do on its own.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const business = await getCurrentBusiness();

  return {
    name: business.business_name,
    short_name: business.business_name,
    description: `Book a professional clean online with ${business.business_name}.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: business.brand_color,
    icons: business.logo_url
      ? [
          { src: business.logo_url, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: business.logo_url, sizes: "512x512", type: "image/png", purpose: "any" },
        ]
      : [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
  };
}
