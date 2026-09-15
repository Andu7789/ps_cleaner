"use client";

import { useTransition } from "react";
import { markInvoicePaidAction, voidInvoiceAction } from "@/lib/actions/invoices";
import type { InvoiceStatus } from "@/lib/types";

export function InvoiceActions({ invoiceId, status }: { invoiceId: string; status: InvoiceStatus }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 flex flex-wrap gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-brand"
      >
        Print / save as PDF
      </button>
      {status === "issued" && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => markInvoicePaidAction(invoiceId))}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            Mark as paid
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => voidInvoiceAction(invoiceId))}
            className="rounded-lg border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
          >
            Void
          </button>
        </>
      )}
    </div>
  );
}
