"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/platform", label: "Businesses" },
  { href: "/platform/checklist", label: "Checklist" },
  { href: "/platform/admins", label: "Admins" },
];

export function PlatformNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Platform sections" className="flex flex-wrap items-center gap-2">
      <span className="mr-2 text-base font-semibold text-foreground">Platform</span>
      {LINKS.map((l) => {
        // The businesses list also owns the individual business pages.
        const active =
          l.href === "/platform"
            ? pathname === "/platform" || (pathname.startsWith("/platform/") && !pathname.startsWith("/platform/checklist") && !pathname.startsWith("/platform/admins"))
            : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              active ? "bg-brand text-brand-foreground" : "border border-border bg-card text-foreground hover:border-brand hover:text-brand"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
