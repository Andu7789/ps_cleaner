import type { ReactNode } from "react";
import Link from "next/link";
import { requireCleaner } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/customer";

// Mirrors the admin (protected) route group: /cleaner/login sits outside
// this layout entirely, so it never runs requireCleaner() or renders nav.
export default async function CleanerLayout({ children }: { children: ReactNode }) {
  const { cleaner } = await requireCleaner();

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Cleaner</p>
          <p className="font-semibold text-foreground">{cleaner.full_name}</p>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="text-sm text-muted-foreground hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <nav className="flex flex-wrap gap-x-4 gap-y-2 border-b border-border py-3 text-sm">
        <Link href="/cleaner" className="font-medium text-foreground hover:text-brand">
          Today
        </Link>
        <Link href="/cleaner/schedule" className="font-medium text-foreground hover:text-brand">
          Schedule
        </Link>
        <Link href="/cleaner/customers" className="font-medium text-foreground hover:text-brand">
          Customers
        </Link>
        <Link href="/cleaner/invoices" className="font-medium text-foreground hover:text-brand">
          Invoices
        </Link>
      </nav>
      <div className="py-6">{children}</div>
    </div>
  );
}
