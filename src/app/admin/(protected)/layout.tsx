import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/customer";

// The (protected) route group keeps /admin/login as a sibling outside this
// layout entirely — it never runs requireAdmin() or renders this nav, no
// pathname-sniffing needed. (Previously done via an x-pathname header set
// in proxy.ts; removed along with proxy.ts itself — see DECISIONS.md.)
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  const links = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/bookings", label: "Bookings" },
    { href: "/admin/cleaners", label: "Cleaners" },
    { href: "/admin/services", label: "Services" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <nav className="flex gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-foreground hover:text-brand">
              {l.label}
            </Link>
          ))}
        </nav>
        <form action={signOutAction}>
          <button type="submit" className="text-sm text-muted-foreground hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <div className="py-6">{children}</div>
    </div>
  );
}
