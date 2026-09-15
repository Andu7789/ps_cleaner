import type { ReactNode } from "react";
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
      <div className="py-6">{children}</div>
    </div>
  );
}
