import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/ui/header";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { getCurrentBusiness } from "@/lib/business";
import { getUser } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateViewport(): Promise<Viewport> {
  const business = await getCurrentBusiness();
  return { themeColor: business.brand_color };
}

export async function generateMetadata(): Promise<Metadata> {
  const business = await getCurrentBusiness();
  return {
    title: { default: business.business_name, template: `%s · ${business.business_name}` },
    description: `Book a professional clean online with ${business.business_name}.`,
    manifest: "/manifest.webmanifest",
    // A real uploaded logo wins for both. Otherwise: the browser favicon
    // comes from favicon.svg (generated per-business from brand_color —
    // see that route for why it's hand-built SVG, not next/og). The Apple
    // touch icon still falls back to the static default, since iOS
    // requires a raster PNG and this app can't generate one dynamically
    // (see favicon.svg/route.ts — the same sharp stub blocks that here too).
    icons: business.logo_url
      ? { icon: [{ url: business.logo_url }], apple: [{ url: business.logo_url }] }
      : {
          icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
          apple: [{ url: "/icon-180.png", sizes: "180x180", type: "image/png" }],
        },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [business, user] = await Promise.all([getCurrentBusiness(), getUser()]);

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* Every bg-brand/text-brand utility ultimately resolves to this custom
          property (see globals.css's @theme inline block) — overriding it
          here is what makes the whole app re-color per business without
          hardcoding a business_id switch into every component that uses
          the brand color. */}
      <head>
        <style>{`:root { --brand: ${business.brand_color}; }`}</style>
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Header businessName={business.business_name} logoUrl={business.logo_url} signedIn={Boolean(user)} />
        <main className="w-full flex-1">{children}</main>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
