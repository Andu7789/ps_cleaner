import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBusinessSettings } from "@/lib/business";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { InvoiceActions } from "@/components/admin/invoice-actions";
import type { Cleaner, CleanerInvoice, CleanerInvoiceItem } from "@/lib/types";

type InvoiceRow = CleanerInvoice & { PS_CLEAN_cleaners: Cleaner | null };

export default async function AdminInvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const supabase = await createClient();

  const [{ data: invoice }, { data: items }, settings] = await Promise.all([
    supabase.from("PS_CLEAN_cleaner_invoices").select("*, PS_CLEAN_cleaners(*)").eq("id", invoiceId).maybeSingle(),
    supabase.from("PS_CLEAN_cleaner_invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at"),
    getBusinessSettings(),
  ]);

  if (!invoice) notFound();
  const inv = invoice as InvoiceRow;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/invoices" className="text-sm text-muted-foreground hover:underline">
        &larr; All invoices
      </Link>
      <div className="mt-4">
        <InvoiceDocument
          invoice={inv}
          items={(items ?? []) as CleanerInvoiceItem[]}
          businessName={settings.business_name}
          cleanerName={inv.PS_CLEAN_cleaners?.full_name ?? "Cleaner"}
        />
        <InvoiceActions invoiceId={inv.id} status={inv.status} />
      </div>
    </div>
  );
}
