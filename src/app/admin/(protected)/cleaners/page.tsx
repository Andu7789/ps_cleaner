import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createCleanerAction, setCleanerActiveAction } from "@/lib/actions/admin";
import { ToggleActiveButton } from "@/components/admin/toggle-active-button";
import type { Cleaner } from "@/lib/types";

export default async function AdminCleanersPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("PS_CLEAN_cleaners").select("*").order("created_at", { ascending: true });
  const cleaners = (data ?? []) as Cleaner[];

  async function addCleaner(formData: FormData) {
    "use server";
    await createCleanerAction({
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? "") || undefined,
      phone: String(formData.get("phone") ?? "") || undefined,
    });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Cleaners</h1>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cleaners.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <Link href={`/admin/cleaners/${c.id}`} className="min-w-0 hover:text-brand">
              <p className="truncate font-medium text-foreground">{c.full_name}</p>
              <p className="truncate text-sm text-muted-foreground">{c.email ?? c.phone ?? "No contact details"}</p>
            </Link>
            <ToggleActiveButton isActive={c.is_active} onToggle={setCleanerActiveAction.bind(null, c.id)} />
          </div>
        ))}
        {cleaners.length === 0 && <p className="text-sm text-muted-foreground">No cleaners yet.</p>}
      </div>

      <form action={addCleaner} className="mt-8 space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Add a cleaner</h2>
        <input name="fullName" required placeholder="Full name" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <input name="email" type="email" placeholder="Email (optional)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <input name="phone" type="tel" placeholder="Phone (optional)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
          Add cleaner
        </button>
      </form>
    </div>
  );
}
