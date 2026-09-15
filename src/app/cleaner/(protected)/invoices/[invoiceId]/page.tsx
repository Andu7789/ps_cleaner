import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCleaner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBusinessSettings } from "@/lib/business";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import type { CleanerInvoice, CleanerInvoiceItem } from "@/lib/types";

export default async function CleanerInvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const { cleaner } = await requireCleaner();
  const supabase = await createClient();

  const [{ data: invoice }, { data: items }, settings] = await Promise.all([
    supabase.from("PS_CLEAN_cleaner_invoices").select("*").eq("id", invoiceId).eq("cleaner_id", cleaner.id).maybeSingle(),
    supabase.from("PS_CLEAN_cleaner_invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at"),
    getBusinessSettings(),
  ]);

  if (!invoice) notFound();

  return (
    <div>
      <Link href="/cleaner/invoices" className="text-sm text-muted-foreground hover:underline">
        &larr; Your invoices
      </Link>
      <div className="mt-4">
        <InvoiceDocument
          invoice={invoice as CleanerInvoice}
          items={(items ?? []) as CleanerInvoiceItem[]}
          businessName={settings.business_name}
          cleanerName={cleaner.full_name}
        />
      </div>
    </div>
  );
}
