import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { createCleanerAction, deleteCleanerAction, setCleanerActiveAction } from "@/lib/actions/admin";
import { ToggleActiveButton } from "@/components/admin/toggle-active-button";
import { DeleteButton } from "@/components/admin/delete-button";
import type { Cleaner } from "@/lib/types";

export default async function AdminCleanersPage() {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_cleaners")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true });
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
            <div className="flex shrink-0 flex-col items-end gap-2">
              <ToggleActiveButton isActive={c.is_active} onToggle={setCleanerActiveAction.bind(null, c.id)} />
              <DeleteButton name={c.full_name} onDelete={deleteCleanerAction.bind(null, c.id)} />
            </div>
          </div>
        ))}
        {cleaners.length === 0 && <p className="text-sm text-muted-foreground">No cleaners yet.</p>}
      </div>

      <form action={addCleaner} className="mt-8 space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Add a cleaner</h2>
        <input name="fullName" required aria-label="Full name" placeholder="Full name" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <input name="email" type="email" required aria-label="Email" placeholder="Email" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <input name="phone" type="tel" required aria-label="Phone" placeholder="Phone" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
          Add cleaner
        </button>
      </form>
    </div>
  );
}
