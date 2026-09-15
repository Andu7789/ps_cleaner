"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header({ businessName, signedIn }: { businessName: string; signedIn: boolean }) {
  const pathname = usePathname();
  // Invoice pages are deliberately standalone documents (see DECISIONS.md
  // — they live outside the admin/cleaner tabbed layouts specifically so
  // they're clean to print/save as a PDF); the site-wide header from this
  // root layout was still showing above them regardless, since it wraps
  // every route, not just ones under those nested layouts.
  const isStandaloneDocument = pathname?.startsWith("/admin/invoice/") || pathname?.startsWith("/cleaner/invoice/");
  if (isStandaloneDocument) return null;

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-base font-semibold text-foreground">
          {businessName}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/book" className="text-foreground hover:text-brand">
            Book a clean
          </Link>
          <Link href={signedIn ? "/account" : "/login"} className="font-medium text-brand hover:underline">
            {signedIn ? "My account" : "Sign in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
