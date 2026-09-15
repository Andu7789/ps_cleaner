import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPence } from "@/lib/format";
import { PayoutForm } from "@/components/admin/payout-form";
import type { Cleaner, CleanerPayout } from "@/lib/types";

type PayoutRow = CleanerPayout & { PS_CLEAN_cleaners: Cleaner | null };

export default async function AdminPayoutsPage() {
  const supabase = await createClient();
  const [{ data: cleaners }, { data: payouts }] = await Promise.all([
    supabase.from("PS_CLEAN_cleaners").select("*").eq("is_active", true).order("full_name"),
    supabase
      .from("PS_CLEAN_cleaner_payouts")
      .select("*, PS_CLEAN_cleaners(*)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Cleaner payouts</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A record of hours and jobs completed per cleaner, for whenever you pay them — this doesn&apos;t move any money itself.
      </p>

      <div className="mt-4">
        {(cleaners ?? []).length > 0 ? (
          <PayoutForm cleaners={cleaners as Cleaner[]} />
        ) : (
          <p className="text-sm text-muted-foreground">Add a cleaner first.</p>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        <div className="mt-2 space-y-2">
          {((payouts ?? []) as PayoutRow[]).map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
              <div>
                <p className="font-medium text-foreground">{p.PS_CLEAN_cleaners?.full_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(p.period_start)} – {formatDate(p.period_end)} · {p.booking_count} jobs · {(p.total_minutes / 60).toFixed(1)}h
                  {p.notes ? ` · ${p.notes}` : ""}
                </p>
              </div>
              <p className="font-semibold text-foreground">{formatPence(p.total_revenue_pence)}</p>
            </div>
          ))}
          {(payouts ?? []).length === 0 && <p className="text-sm text-muted-foreground">No payouts recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}
