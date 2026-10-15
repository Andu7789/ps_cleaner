"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEMO_COPY } from "@/lib/demo-content";
import { signOutAction } from "@/lib/actions/customer";

export function Header({
  businessName,
  logoUrl,
  signedIn,
  brandHeader = false,
}: {
  businessName: string;
  logoUrl?: string | null;
  signedIn: boolean;
  brandHeader?: boolean;
}) {
  const pathname = usePathname();
  // Invoice pages are deliberately standalone documents (see DECISIONS.md
  // — they live outside the admin/cleaner tabbed layouts specifically so
  // they're clean to print/save as a PDF); the site-wide header from this
  // root layout was still showing above them regardless, since it wraps
  // every route, not just ones under those nested layouts.
  const isStandaloneDocument = pathname?.startsWith("/admin/invoice/") || pathname?.startsWith("/cleaner/invoice/");
  if (isStandaloneDocument) return null;
  const onDemo = pathname?.startsWith("/demo") ?? false;

  return (
    <header
      className={`sticky top-0 z-20 border-b ${
        brandHeader ? "border-transparent bg-brand text-brand-foreground" : "border-border bg-card"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className={`flex items-center gap-2 text-base font-semibold ${brandHeader ? "text-brand-foreground" : "text-foreground"}`}
        >
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- per-business logo, arbitrary external URL
            <img src={logoUrl} alt="" className="h-8 w-auto max-w-40 object-contain" />
          )}
          {businessName}
        </Link>
        <nav className="flex shrink-0 items-center gap-3 whitespace-nowrap text-sm sm:gap-4">
          <Link href="/book" className={brandHeader ? "text-brand-foreground hover:underline" : "text-foreground hover:text-brand"}>
            Book a clean
          </Link>
          <Link
            href={signedIn ? "/account" : "/login"}
            className={`font-medium hover:underline ${brandHeader ? "text-brand-foreground" : "text-brand"}`}
          >
            {signedIn ? "My account" : "Sign in"}
          </Link>
          {signedIn && (
            <form action={signOutAction}>
              <button
                type="submit"
                className={brandHeader ? "text-brand-foreground hover:underline" : "text-muted-foreground hover:text-foreground"}
              >
                Sign out
              </button>
            </form>
          )}
          {/* Lets the owner flip between the live homepage and the demo look. */}
          <Link
            href={onDemo ? "/" : "/demo"}
            className="rounded-full border border-current px-3 py-1 text-xs font-semibold opacity-90 hover:opacity-100"
          >
            {onDemo ? DEMO_COPY.toggle.toCurrent : DEMO_COPY.toggle.toDemo}
          </Link>
        </nav>
      </div>
    </header>
  );
}
