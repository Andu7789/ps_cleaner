import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { InvoiceActions } from "@/components/admin/invoice-actions";
import type { Cleaner, CleanerInvoice, CleanerInvoiceItem } from "@/lib/types";

type InvoiceRow = CleanerInvoice & { PS_CLEAN_cleaners: Cleaner | null };

// Deliberately outside the /admin/(protected) route group, the same way
// /admin/login sits outside it — an invoice is a document meant to be
// read, printed, or saved as a PDF on its own, not browsed via the admin
// section tabs, which would print/export alongside it otherwise. Auth is
// checked directly here instead of inheriting it from that layout.
export default async function AdminInvoiceDocumentPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  await requireAdmin();
  const { invoiceId } = await params;
  const supabase = await createClient();

  const [{ data: invoice }, { data: items }, business] = await Promise.all([
    supabase.from("PS_CLEAN_cleaner_invoices").select("*, PS_CLEAN_cleaners(*)").eq("id", invoiceId).maybeSingle(),
    supabase.from("PS_CLEAN_cleaner_invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at"),
    getCurrentBusiness(),
  ]);

  if (!invoice) notFound();
  const inv = invoice as InvoiceRow;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/admin/invoices" className="text-sm text-muted-foreground hover:underline print:hidden">
        &larr; All invoices
      </Link>
      <div className="mt-4">
        <InvoiceDocument
          invoice={inv}
          items={(items ?? []) as CleanerInvoiceItem[]}
          businessName={business.business_name}
          cleanerName={inv.PS_CLEAN_cleaners?.full_name ?? "Cleaner"}
        />
        <InvoiceActions invoiceId={inv.id} status={inv.status} />
      </div>
    </div>
  );
}
