"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone } from "lucide-react";

// Same gold as the homepage's main call to action.
const GOLD = "#e8c47c";

export function Header({
  businessName,
  logoUrl,
  bookNowHref,
  phone,
  brandHeader = false,
}: {
  businessName: string;
  logoUrl?: string | null;
  // The walkthrough booking page, where every new customer starts.
  bookNowHref: string;
  phone?: string | null;
  brandHeader?: boolean;
}) {
  const pathname = usePathname();
  // Invoice pages are deliberately standalone documents (see DECISIONS.md
  // — they live outside the admin/cleaner tabbed layouts specifically so
  // they're clean to print/save as a PDF); the site-wide header from this
  // root layout was still showing above them regardless, since it wraps
  // every route, not just ones under those nested layouts.
  const isStandaloneDocument = pathname?.startsWith("/admin/invoice/") || pathname?.startsWith("/cleaner/invoice/");
  // The owner intake form and the platform portal belong to the platform, not
  // to whichever business the host happens to resolve to.
  const isPlatformPage = pathname?.startsWith("/start/") || pathname?.startsWith("/platform");
  if (isStandaloneDocument || isPlatformPage) return null;

  const tel = phone?.replace(/[^\d+]/g, "");

  return (
    <header
      className={`sticky top-0 z-20 border-b ${
        brandHeader ? "border-transparent bg-brand text-brand-foreground" : "border-border bg-card"
      }`}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link
          href="/"
          className={`flex items-center gap-2 text-base font-semibold ${brandHeader ? "text-brand-foreground" : "text-foreground"}`}
        >
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- per-business logo, arbitrary external URL
            <img src={logoUrl} alt="" className="h-8 w-auto max-w-40 object-contain" />
          )}
          {businessName}
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
          {tel && (
            <a
              href={`tel:${tel}`}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-1 font-medium hover:underline ${
                brandHeader ? "text-brand-foreground" : "text-foreground"
              }`}
            >
              <Phone className="size-4" aria-hidden="true" />
              Call us on {phone}
            </a>
          )}
          <Link
            href="/amend"
            className={`whitespace-nowrap rounded-full border px-4 py-2 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              brandHeader
                ? "border-white/40 text-brand-foreground hover:bg-white/10 focus-visible:outline-white"
                : "border-border text-foreground hover:border-brand focus-visible:outline-brand"
            }`}
          >
            Amend existing booking
          </Link>
          <Link
            href={bookNowHref}
            className="whitespace-nowrap rounded-full px-5 py-2 text-base font-semibold text-[#2a1018] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
            style={{ backgroundColor: GOLD }}
          >
            Book now
          </Link>
        </nav>
      </div>
    </header>
  );
}
