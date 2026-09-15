"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { previewInvoiceAction, generateInvoiceAction, type InvoicePreview } from "@/lib/actions/invoices";
import { formatDate, formatPence } from "@/lib/format";
import type { Cleaner } from "@/lib/types";

function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // back up to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InvoiceGenerateForm({ cleaners, defaultCleanerId }: { cleaners: Cleaner[]; defaultCleanerId?: string }) {
  const router = useRouter();
  const [cleanerId, setCleanerId] = useState(defaultCleanerId ?? cleaners[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState(startOfWeek());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cleanerId || !periodStart || !periodEnd) return;
    let cancelled = false;
    previewInvoiceAction(cleanerId, new Date(periodStart).toISOString(), new Date(`${periodEnd}T23:59:59`).toISOString())
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't calculate this period");
      });
    return () => {
      cancelled = true;
    };
  }, [cleanerId, periodStart, periodEnd]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const invoiceId = await generateInvoiceAction(
        cleanerId,
        new Date(periodStart).toISOString(),
        new Date(`${periodEnd}T23:59:59`).toISOString(),
        notes || undefined
      );
      router.push(`/admin/invoice/${invoiceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate this invoice");
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold text-foreground">Generate an invoice</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted-foreground">
          Cleaner
          <select value={cleanerId} onChange={(e) => setCleanerId(e.target.value)} className="mt-1 block w-full rounded-lg border border-border px-2 py-1.5 text-sm">
            {cleaners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          From
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1 block w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1 block w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
        </label>
      </div>
      <button
        type="button"
        onClick={() => setPeriodStart(startOfWeek())}
        className="mt-2 text-xs font-medium text-brand hover:underline"
      >
        This week
      </button>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {preview && !error && (
        <div className="mt-4">
          {preview.lines.length > 0 ? (
            <div className="space-y-1">
              {preview.lines.map((line) => (
                <div key={line.bookingId} className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
                  <span>
                    {formatDate(line.date)} &middot; {line.serviceName}
                  </span>
                  <span className="font-medium">{formatPence(line.amountPence)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 pt-2 text-sm font-semibold text-foreground">
                <span>Total</span>
                <span>{formatPence(preview.totalPence)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No uninvoiced completed jobs in this period.</p>
          )}
        </div>
      )}

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm"
      />

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating || !cleanerId || !preview || preview.lines.length === 0}
        className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
      >
        {generating ? "Generating…" : "Generate invoice"}
      </button>
    </div>
  );
}
