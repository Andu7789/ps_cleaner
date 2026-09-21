import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { formatDate, formatPence } from "@/lib/format";
import { InvoiceGenerateForm } from "@/components/admin/invoice-generate-form";
import type { Cleaner, CleanerInvoice } from "@/lib/types";

type InvoiceRow = CleanerInvoice & { PS_CLEAN_cleaners: Cleaner | null };

const STATUS_STYLE: Record<string, string> = {
  issued: "text-amber-600",
  paid: "text-success",
  void: "text-muted-foreground line-through",
};

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ cleanerId?: string }>;
}) {
  const { cleanerId } = await searchParams;
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const [{ data: cleaners }, { data: invoices }] = await Promise.all([
    supabase.from("PS_CLEAN_cleaners").select("*").eq("business_id", business.id).eq("is_active", true).order("full_name"),
    supabase
      .from("PS_CLEAN_cleaner_invoices")
      .select("*, PS_CLEAN_cleaners(*)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Cleaner invoices</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Generate a numbered invoice from a cleaner&apos;s completed jobs, showing exactly what they&apos;re owed for
        the period based on their pay rate.
      </p>

      <div className="mt-4">
        {(cleaners ?? []).length > 0 ? (
          <InvoiceGenerateForm cleaners={cleaners as Cleaner[]} defaultCleanerId={cleanerId} />
        ) : (
          <p className="text-sm text-muted-foreground">Add a cleaner first.</p>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        <div className="mt-2 space-y-2">
          {((invoices ?? []) as InvoiceRow[]).map((inv) => (
            <Link
              key={inv.id}
              href={`/admin/invoice/${inv.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm transition hover:border-brand"
            >
              <div>
                <p className="font-medium text-foreground">
                  {inv.invoice_number} &middot; {inv.PS_CLEAN_cleaners?.full_name ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">{formatPence(inv.total_pence)}</p>
                <p className={`text-xs capitalize ${STATUS_STYLE[inv.status]}`}>{inv.status}</p>
              </div>
            </Link>
          ))}
          {(invoices ?? []).length === 0 && <p className="text-sm text-muted-foreground">No invoices generated yet.</p>}
        </div>
      </div>
    </div>
  );
}
