import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { formatPence, formatTime } from "@/lib/format";
import type { Booking, Cleaner, Service } from "@/lib/types";

export default async function AdminOverviewPage() {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const { data } = await supabase
    .from("PS_CLEAN_bookings")
    .select("*, PS_CLEAN_services(*), PS_CLEAN_cleaners(*)")
    .eq("business_id", business.id)
    .gte("starts_at", todayStart.toISOString())
    .lt("starts_at", todayEnd.toISOString())
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });

  const todaysBookings = (data ?? []) as (Booking & { PS_CLEAN_services: Service; PS_CLEAN_cleaners: Cleaner })[];
  const revenueToday = todaysBookings.reduce((sum, b) => sum + b.amount_paid_pence, 0);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Today</h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Jobs today</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{todaysBookings.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Collected today</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{formatPence(revenueToday)}</p>
        </div>
        <Link href="/admin/bookings" className="rounded-xl border border-border bg-card p-4 hover:border-brand">
          <p className="text-sm text-muted-foreground">Manage</p>
          <p className="mt-1 text-2xl font-semibold text-brand">All bookings →</p>
        </Link>
      </div>

      <div className="mt-8 space-y-2">
        {todaysBookings.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
            <span>
              {formatTime(b.starts_at)} — {b.PS_CLEAN_services.name} with {b.PS_CLEAN_cleaners.full_name}
            </span>
            <span className="capitalize text-muted-foreground">{b.status.replace("_", " ")}</span>
          </div>
        ))}
        {todaysBookings.length === 0 && <p className="text-sm text-muted-foreground">No jobs scheduled today.</p>}
      </div>
    </div>
  );
}
