import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { signOutAction } from "@/lib/actions/customer";

export const metadata: Metadata = { title: { absolute: "Platform" }, robots: { index: false } };

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div data-bare-page className="neutral-page mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <Link href="/platform" className="text-base font-semibold text-foreground">
          Platform
        </Link>
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
