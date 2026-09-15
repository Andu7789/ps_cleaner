import Link from "next/link";
import { requireCleaner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPence } from "@/lib/format";
import type { CleanerInvoice } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  issued: "text-amber-600",
  paid: "text-success",
  void: "text-muted-foreground line-through",
};

export default async function CleanerInvoicesPage() {
  const { cleaner } = await requireCleaner();
  const supabase = await createClient();

  const { data } = await supabase
    .from("PS_CLEAN_cleaner_invoices")
    .select("*")
    .eq("cleaner_id", cleaner.id)
    .order("created_at", { ascending: false });
  const invoices = (data ?? []) as CleanerInvoice[];

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Your invoices</h1>
      <div className="mt-4 space-y-2">
        {invoices.map((inv) => (
          <Link
            key={inv.id}
            href={`/cleaner/invoices/${inv.id}`}
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
