import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/ui/header";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { getCurrentBusiness } from "@/lib/business";
import { getUser } from "@/lib/auth";
import { backgroundAttrs, brandCss } from "@/lib/branding";
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
    // A real uploaded logo wins for both. Otherwise both fall back to the
    // static white gloves PNGs in public/. The old generated favicon.svg
    // (a brand coloured initial) is no longer used here, which is why the
    // tab was still showing green.
    icons: business.icon_url ?? business.logo_url
      ? {
          icon: [{ url: (business.icon_url ?? business.logo_url)! }],
          apple: [{ url: (business.icon_url ?? business.logo_url)! }],
        }
      : {
          icon: [
            { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
            { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
          ],
          apple: [{ url: "/icon-180.png", sizes: "180x180", type: "image/png" }],
        },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [business, user] = await Promise.all([getCurrentBusiness(), getUser()]);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      {...backgroundAttrs(business)}
    >
      {/* Every bg-brand/text-brand utility ultimately resolves to this custom
          property (see globals.css's @theme inline block) — overriding it
          here is what makes the whole app re-color per business without
          hardcoding a business_id switch into every component that uses
          the brand color. */}
      <head>
        <style>{brandCss(business)}</style>
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Header
          businessName={business.business_name}
          logoUrl={business.logo_url}
          signedIn={Boolean(user)}
          brandHeader={business.header_style === "brand"}
        />
        <main className="relative z-10 w-full flex-1">{children}</main>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
