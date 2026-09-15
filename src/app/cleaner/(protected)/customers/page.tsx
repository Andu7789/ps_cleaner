import { requireCleaner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { Customer, CustomerAddress } from "@/lib/types";

interface JobForCustomer {
  starts_at: string;
  status: string;
  PS_CLEAN_customers: Customer | null;
  PS_CLEAN_customer_addresses: CustomerAddress | null;
}

interface CustomerSummary {
  customer: Customer;
  address: CustomerAddress | null;
  jobCount: number;
  lastVisit: string;
}

export default async function CleanerCustomersPage() {
  const { cleaner } = await requireCleaner();
  const supabase = await createClient();

  const { data } = await supabase
    .from("PS_CLEAN_bookings")
    .select("starts_at, status, PS_CLEAN_customers(*), PS_CLEAN_customer_addresses(*)")
    .eq("cleaner_id", cleaner.id)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: false });

  const jobs = (data ?? []) as unknown as JobForCustomer[];
  const byCustomer = new Map<string, CustomerSummary>();
  for (const job of jobs) {
    if (!job.PS_CLEAN_customers) continue;
    const existing = byCustomer.get(job.PS_CLEAN_customers.id);
    if (existing) {
      existing.jobCount += 1;
    } else {
      byCustomer.set(job.PS_CLEAN_customers.id, {
        customer: job.PS_CLEAN_customers,
        address: job.PS_CLEAN_customer_addresses,
        jobCount: 1,
        lastVisit: job.starts_at,
      });
    }
  }
  // Jobs are already ordered most-recent-first, so the first time we see a
  // customer is their most recent visit — no extra sort needed here.
  const customers = Array.from(byCustomer.values());

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Your customers</h1>
      <p className="mt-1 text-sm text-muted-foreground">Everyone you&apos;ve cleaned for, most recent first.</p>
      <div className="mt-4 space-y-2">
        {customers.map(({ customer, address, jobCount, lastVisit }) => (
          <div key={customer.id} className="rounded-xl border border-border bg-card p-4 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium text-foreground">{customer.full_name ?? "Customer"}</p>
              <p className="text-xs text-muted-foreground">
                {jobCount} job{jobCount === 1 ? "" : "s"}
              </p>
            </div>
            {address && (
              <p className="mt-1 text-muted-foreground">
                {address.line1}, {address.city} {address.postcode}
              </p>
            )}
            {customer.phone && (
              <p className="mt-1">
                <a href={`tel:${customer.phone}`} className="text-brand hover:underline">
                  {customer.phone}
                </a>
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Last visit: {formatDate(lastVisit)}</p>
          </div>
        ))}
        {customers.length === 0 && <p className="text-sm text-muted-foreground">No customers yet.</p>}
      </div>
    </div>
  );
}
