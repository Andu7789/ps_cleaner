import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import { signOutAction } from "@/lib/actions/customer";

// The (protected) route group keeps /admin/login as a sibling outside this
// layout entirely — it never runs requireAdmin() or renders this nav, no
// pathname-sniffing needed. (Previously done via an x-pathname header set
// in proxy.ts; removed along with proxy.ts itself — see DECISIONS.md.)
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="neutral-page mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <AdminNav />
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
