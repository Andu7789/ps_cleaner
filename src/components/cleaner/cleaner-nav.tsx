"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/cleaner", label: "Today" },
  { href: "/cleaner/schedule", label: "Schedule" },
  { href: "/cleaner/customers", label: "Customers" },
  { href: "/cleaner/invoices", label: "Invoices" },
];

export function CleanerNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Cleaner sections" className="flex flex-wrap gap-2 border-b border-border py-3">
      {TABS.map((tab) => {
        const active = tab.href === "/cleaner" ? pathname === "/cleaner" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-base font-bold transition ${
              active
                ? "bg-brand text-brand-foreground shadow-md ring-2 ring-brand/30"
                : "border border-border bg-card text-foreground hover:border-brand hover:text-brand"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
