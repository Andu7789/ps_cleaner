import Link from "next/link";
import { requireCleaner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPence, formatTime } from "@/lib/format";
import type { Booking, Customer, CustomerAddress, Service } from "@/lib/types";

type Row = Booking & { PS_CLEAN_services: Service; PS_CLEAN_customers: Customer; PS_CLEAN_customer_addresses: CustomerAddress };

// This cleaner's bookings that are priced by quote and are still waiting for
// the owner to confirm the price. Read only: the owner sets it, and the
// cleaner is emailed once it is confirmed.
export default async function CleanerQuotesPage() {
  const { cleaner } = await requireCleaner();
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_bookings")
    .select("*, PS_CLEAN_services(*), PS_CLEAN_customers(*), PS_CLEAN_customer_addresses(*)")
    .eq("cleaner_id", cleaner.id)
    .eq("quote_status", "pending")
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  const rows = (data ?? []) as Row[];

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Waiting for price confirmation</h1>
      <p className="text-sm text-muted-foreground">
        The owner is confirming the exact price for these. You will be emailed when each one is ready.
      </p>
      <div className="mt-4 space-y-3">
        {rows.map((b) => (
          <Link
            key={b.id}
            href={`/cleaner/bookings/${b.id}`}
            className="block rounded-xl border border-border bg-card p-4 transition hover:border-brand"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">{b.PS_CLEAN_services.name}</span>
              <span className="text-xs text-muted-foreground">Estimate {formatPence(b.price_pence)}</span>
            </div>
            <p className="mt-1 text-sm text-foreground">
              {b.PS_CLEAN_customers?.full_name}
              {b.PS_CLEAN_customers?.phone ? ` · ${b.PS_CLEAN_customers.phone}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatDate(b.starts_at)} at {formatTime(b.starts_at)}
              {b.PS_CLEAN_customer_addresses ? ` · ${b.PS_CLEAN_customer_addresses.postcode}` : ""}
            </p>
          </Link>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting, all your prices are confirmed.</p>}
      </div>
    </div>
  );
}
