import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/ui/header";
import { getBusinessSettings } from "@/lib/business";
import { getUser } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getBusinessSettings();
  return {
    title: { default: settings.business_name, template: `%s · ${settings.business_name}` },
    description: `Book a professional clean online with ${settings.business_name}.`,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [settings, user] = await Promise.all([getBusinessSettings(), getUser()]);

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Header businessName={settings.business_name} signedIn={Boolean(user)} />
        <main className="w-full flex-1">{children}</main>
      </body>
    </html>
  );
}
