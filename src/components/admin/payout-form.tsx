"use client";

import { useEffect, useState } from "react";
import { previewPayoutAction, recordPayoutAction, type PayoutSummary } from "@/lib/actions/payouts";
import { formatPence } from "@/lib/format";
import type { Cleaner } from "@/lib/types";

function firstOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PayoutForm({ cleaners }: { cleaners: Cleaner[] }) {
  const [cleanerId, setCleanerId] = useState(cleaners[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState(firstOfMonth());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [notes, setNotes] = useState("");
  // null = no preview has landed yet for the current selection. Kept stale
  // (not reset to null) across a selection change so adjusting the date
  // range doesn't flash empty — same convention as the booking slot picker.
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    if (!cleanerId || !periodStart || !periodEnd) return;
    let cancelled = false;
    previewPayoutAction(cleanerId, new Date(periodStart).toISOString(), new Date(periodEnd).toISOString())
      .then((result) => {
        if (!cancelled) {
          setSummary(result);
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

  async function handleRecord() {
    setRecording(true);
    setError(null);
    try {
      await recordPayoutAction(cleanerId, new Date(periodStart).toISOString(), new Date(periodEnd).toISOString(), notes || undefined);
      setRecorded(true);
      setNotes("");
      setTimeout(() => setRecorded(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record this payout");
    } finally {
      setRecording(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold text-foreground">Record a payout</h2>
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

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {summary && !error && (
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-muted p-3 text-center text-sm">
          <div>
            <p className="font-semibold text-foreground">{summary.bookingCount}</p>
            <p className="text-xs text-muted-foreground">Jobs</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">{(summary.totalMinutes / 60).toFixed(1)}h</p>
            <p className="text-xs text-muted-foreground">Hours</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">{formatPence(summary.totalRevenuePence)}</p>
            <p className="text-xs text-muted-foreground">Revenue</p>
          </div>
        </div>
      )}

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional, e.g. paid via bank transfer 12 Oct)"
        className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm"
      />

      <button
        type="button"
        onClick={handleRecord}
        disabled={recording || !cleanerId || !summary || summary.bookingCount === 0}
        className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
      >
        {recorded ? "Recorded!" : recording ? "Recording…" : "Record payout for this period"}
      </button>
    </div>
  );
}
