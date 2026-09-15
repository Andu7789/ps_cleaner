import { formatDate, formatPence } from "@/lib/format";
import type { CleanerInvoice, CleanerInvoiceItem } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  issued: "bg-amber-100 text-amber-700",
  paid: "bg-success/10 text-success",
  void: "bg-muted text-muted-foreground",
};

export function InvoiceDocument({
  invoice,
  items,
  businessName,
  cleanerName,
}: {
  invoice: CleanerInvoice;
  items: CleanerInvoiceItem[];
  businessName: string;
  cleanerName: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 print:border-none print:shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{businessName}</h1>
          <p className="text-sm text-muted-foreground">Cleaner invoice</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold text-foreground">{invoice.invoice_number}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[invoice.status]}`}>
            {invoice.status}
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid to</p>
          <p className="font-medium text-foreground">{cleanerName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Period</p>
          <p className="font-medium text-foreground">
            {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
          </p>
        </div>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 font-medium">Job</th>
            <th className="pb-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border">
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-right">{formatPence(item.amount_pence)}</td>
            </tr>
          ))}
          {items.length === 0 && invoice.status === "void" && (
            <tr>
              <td colSpan={2} className="py-2 text-muted-foreground">
                Voided — jobs released back for re-invoicing.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-3 font-semibold text-foreground">Total</td>
            <td className="pt-3 text-right font-semibold text-foreground">{formatPence(invoice.total_pence)}</td>
          </tr>
        </tfoot>
      </table>

      {invoice.notes && (
        <p className="mt-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Notes: </span>
          {invoice.notes}
        </p>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Issued {formatDate(invoice.issued_at)}
        {invoice.paid_at ? ` · Paid ${formatDate(invoice.paid_at)}` : ""}
      </p>
    </div>
  );
}
