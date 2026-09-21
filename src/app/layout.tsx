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

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export async function generateMetadata(): Promise<Metadata> {
  const business = await getCurrentBusiness();
  return {
    title: { default: business.business_name, template: `%s · ${business.business_name}` },
    description: `Book a professional clean online with ${business.business_name}.`,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [{ url: "/icon-32.png", sizes: "32x32", type: "image/png" }],
      apple: [{ url: "/icon-180.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [business, user] = await Promise.all([getCurrentBusiness(), getUser()]);

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Header businessName={business.business_name} signedIn={Boolean(user)} />
        <main className="w-full flex-1">{children}</main>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
