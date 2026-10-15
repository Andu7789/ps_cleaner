"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/cleaners", label: "Cleaners" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/addons", label: "Add-ons" },
  { href: "/admin/invoices", label: "Invoices" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/demo-data", label: "Demo data" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="flex flex-wrap gap-2">
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
              active
                ? "bg-brand text-brand-foreground shadow-md ring-2 ring-brand/30"
                : "border border-border bg-card text-foreground hover:border-brand hover:text-brand"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
