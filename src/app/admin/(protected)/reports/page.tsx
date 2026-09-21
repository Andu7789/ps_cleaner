import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { formatPence } from "@/lib/format";
import type { PaymentStatus, PaymentType } from "@/lib/types";

interface PaymentRow {
  amount_pence: number;
  type: PaymentType;
  status: PaymentStatus;
  created_at: string;
}

interface BookingRow {
  id: string;
  customer_id: string;
  status: string;
  price_pence: number;
  service_id: string;
  PS_CLEAN_services: { name: string } | null;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function AdminReportsPage() {
  await requireAdmin();
  const business = await getCurrentBusiness();
  const supabase = await createClient();

  const [{ data: paymentData }, { data: bookingData }] = await Promise.all([
    supabase
      .from("PS_CLEAN_payments")
      .select("amount_pence, type, status, created_at")
      .eq("business_id", business.id)
      .eq("status", "succeeded"),
    supabase
      .from("PS_CLEAN_bookings")
      .select("id, customer_id, status, price_pence, service_id, PS_CLEAN_services(name)")
      .eq("business_id", business.id)
      .neq("status", "cancelled"),
  ]);

  const payments = (paymentData ?? []) as PaymentRow[];
  const bookings = (bookingData ?? []) as unknown as BookingRow[];

  // Revenue: every succeeded payment counts, except a refund reverses it —
  // this is actual cash movement, not just booking face value, so it stays
  // correct even for a booking that was partially refunded after the fact.
  const totalRevenue = payments.reduce((sum, p) => sum + (p.type === "refund" ? -p.amount_pence : p.amount_pence), 0);

  const now = new Date();
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const revenueByMonth = new Map<string, number>();
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(sixMonthsAgo.getUTCFullYear(), sixMonthsAgo.getUTCMonth() + i, 1));
    revenueByMonth.set(monthKey(d.toISOString()), 0);
  }
  for (const p of payments) {
    const key = monthKey(p.created_at);
    if (revenueByMonth.has(key)) {
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + (p.type === "refund" ? -p.amount_pence : p.amount_pence));
    }
  }
  const maxMonthRevenue = Math.max(1, ...Array.from(revenueByMonth.values()));

  // Popular services: counted from confirmed/completed bookings (i.e. ones
  // that actually held a slot), not raw catalog popularity.
  const serviceStats = new Map<string, { name: string; count: number; revenue: number }>();
  for (const b of bookings) {
    const existing = serviceStats.get(b.service_id) ?? {
      name: b.PS_CLEAN_services?.name ?? "Unknown service",
      count: 0,
      revenue: 0,
    };
    existing.count += 1;
    existing.revenue += b.price_pence;
    serviceStats.set(b.service_id, existing);
  }
  const popularServices = Array.from(serviceStats.values()).sort((a, b) => b.count - a.count);
  const maxServiceCount = Math.max(1, ...popularServices.map((s) => s.count));

  // Repeat rate: of customers who've had at least one completed booking,
  // what share came back for a second (or more)?
  const completedByCustomer = new Map<string, number>();
  for (const b of bookings) {
    if (b.status !== "completed") continue;
    completedByCustomer.set(b.customer_id, (completedByCustomer.get(b.customer_id) ?? 0) + 1);
  }
  const customersWithACompletedBooking = completedByCustomer.size;
  const repeatCustomers = Array.from(completedByCustomer.values()).filter((n) => n > 1).length;
  const repeatRate = customersWithACompletedBooking > 0 ? (repeatCustomers / customersWithACompletedBooking) * 100 : 0;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Reports</h1>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total revenue</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{formatPence(totalRevenue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Completed jobs</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {bookings.filter((b) => b.status === "completed").length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Repeat customer rate</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{repeatRate.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">
            {repeatCustomers} of {customersWithACompletedBooking} customers came back
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Revenue by month</h2>
        <div className="mt-4 space-y-2">
          {Array.from(revenueByMonth.entries()).map(([key, amount]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">{monthLabel(key)}</span>
              <div className="h-3 flex-1 rounded-full bg-muted">
                <div
                  className="h-3 rounded-full bg-brand"
                  style={{ width: `${Math.max(2, (Math.max(0, amount) / maxMonthRevenue) * 100)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-medium text-foreground">
                {formatPence(amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Popular services</h2>
        <div className="mt-4 space-y-2">
          {popularServices.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{s.name}</span>
              <div className="h-3 flex-1 rounded-full bg-muted">
                <div
                  className="h-3 rounded-full bg-brand"
                  style={{ width: `${Math.max(2, (s.count / maxServiceCount) * 100)}%` }}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-xs font-medium text-foreground">
                {s.count} bookings &middot; {formatPence(s.revenue)}
              </span>
            </div>
          ))}
          {popularServices.length === 0 && <p className="text-sm text-muted-foreground">No bookings yet.</p>}
        </div>
      </div>
    </div>
  );
}
