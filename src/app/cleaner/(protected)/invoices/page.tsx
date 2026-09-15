import Link from "next/link";
import { requireCleaner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPence } from "@/lib/format";
import { computePayable } from "@/lib/pay-rate";
import { toLondonDateKey } from "@/lib/calendar";
import type { Booking, CleanerInvoice } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  issued: "text-amber-600",
  paid: "text-success",
  void: "text-muted-foreground line-through",
};

export default async function CleanerInvoicesPage() {
  const { cleaner } = await requireCleaner();
  const supabase = await createClient();

  const now = new Date();
  const todayKey = toLondonDateKey(now.toISOString());
  const [thisYear, thisMonth] = todayKey.split("-").map(Number);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(Date.UTC(thisYear, thisMonth - 1, 1)).toISOString();

  const [{ data }, { data: recentJobs }] = await Promise.all([
    supabase.from("PS_CLEAN_cleaner_invoices").select("*").eq("cleaner_id", cleaner.id).order("created_at", { ascending: false }),
    // Earnings are computed straight from completed jobs + pay rate, not
    // from invoice dates — a job earned this week even if it hasn't been
    // invoiced yet, and an invoice's period rarely lines up neatly with a
    // calendar week/month anyway.
    supabase
      .from("PS_CLEAN_bookings")
      .select("starts_at, ends_at, price_pence")
      .eq("cleaner_id", cleaner.id)
      .eq("status", "completed")
      .gte("starts_at", monthAgo),
  ]);
  const invoices = (data ?? []) as CleanerInvoice[];
  const jobs = (recentJobs ?? []) as Pick<Booking, "starts_at" | "ends_at" | "price_pence">[];

  const weekTotal = jobs
    .filter((j) => j.starts_at >= weekAgo)
    .reduce((sum, j) => sum + computePayable(j, cleaner.pay_rate_type, cleaner.pay_rate_value), 0);
  const monthTotal = jobs.reduce((sum, j) => sum + computePayable(j, cleaner.pay_rate_type, cleaner.pay_rate_value), 0);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Your invoices</h1>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">This week</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{formatPence(weekTotal)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">This month</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{formatPence(monthTotal)}</p>
        </div>
      </div>

      <h2 className="mt-6 text-sm font-semibold text-foreground">Invoices</h2>
      <div className="mt-2 space-y-2">
        {invoices.map((inv) => (
          <Link
            key={inv.id}
            href={`/cleaner/invoice/${inv.id}`}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition hover:border-brand"
          >
            <div>
              <p className="font-medium text-foreground">{inv.invoice_number}</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-foreground">{formatPence(inv.total_pence)}</p>
              <p className={`text-xs capitalize ${STATUS_STYLE[inv.status]}`}>{inv.status}</p>
            </div>
          </Link>
        ))}
        {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
      </div>
    </div>
  );
}
