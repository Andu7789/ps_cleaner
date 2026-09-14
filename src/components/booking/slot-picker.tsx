"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAvailableSlotsAction } from "@/lib/actions/booking";
import { candidateStartTimes } from "@/lib/slots";
import { formatTime } from "@/lib/format";
import type { Cleaner, FreeSlotRange, Service } from "@/lib/types";

function nextDays(count: number): Date[] {
  const days: Date[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function SlotPicker({ service, cleaners }: { service: Service; cleaners: Cleaner[] }) {
  const router = useRouter();
  const days = useMemo(() => nextDays(14), []);
  const [selectedDate, setSelectedDate] = useState(days[0]);
  // null = no successful fetch has landed yet for the current date. Kept
  // stale (not reset to null) across a date change so switching dates
  // doesn't flash a loading state — matches this workspace's convention
  // for on-demand client fetches (see Root Cafe's change-history.tsx).
  const [ranges, setRanges] = useState<FreeSlotRange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanerById = useMemo(() => new Map(cleaners.map((c) => [c.id, c])), [cleaners]);

  useEffect(() => {
    let cancelled = false;
    getAvailableSlotsAction(service.id, toDateParam(selectedDate))
      .then((data) => {
        if (!cancelled) {
          setRanges(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load availability");
      });
    return () => {
      cancelled = true;
    };
  }, [service.id, selectedDate]);

  const loading = ranges === null && error === null;

  const slotsByCleanerId = useMemo(() => {
    const grouped = new Map<string, FreeSlotRange[]>();
    for (const r of ranges ?? []) {
      if (!grouped.has(r.cleaner_id)) grouped.set(r.cleaner_id, []);
      grouped.get(r.cleaner_id)!.push(r);
    }
    const result = new Map<string, Date[]>();
    for (const [cleanerId, cleanerRanges] of grouped) {
      result.set(
        cleanerId,
        candidateStartTimes(cleanerRanges, {
          durationMinutes: service.duration_minutes,
          bufferBeforeMinutes: service.buffer_before_minutes,
          bufferAfterMinutes: service.buffer_after_minutes,
        })
      );
    }
    return result;
  }, [ranges, service]);

  function chooseSlot(cleanerId: string, startsAt: Date) {
    const params = new URLSearchParams({ cleanerId, startsAt: startsAt.toISOString() });
    router.push(`/book/${service.id}/checkout?${params.toString()}`);
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => {
          const isSelected = toDateParam(d) === toDateParam(selectedDate);
          return (
            <button
              key={toDateParam(d)}
              onClick={() => setSelectedDate(d)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${
                isSelected ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card text-foreground"
              }`}
            >
              {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
            </button>
          );
        })}
      </div>

      <div className="mt-6 space-y-6">
        {loading && <p className="text-sm text-muted-foreground">Loading availability…</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!loading &&
          !error &&
          Array.from(slotsByCleanerId.entries()).map(([cleanerId, starts]) => {
            const cleaner = cleanerById.get(cleanerId);
            if (!cleaner || starts.length === 0) return null;
            return (
              <div key={cleanerId}>
                <h3 className="font-medium text-foreground">{cleaner.full_name}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {starts.map((s) => (
                    <button
                      key={s.toISOString()}
                      onClick={() => chooseSlot(cleanerId, s)}
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:border-brand hover:text-brand"
                    >
                      {formatTime(s.toISOString())}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        {!loading && !error && slotsByCleanerId.size === 0 && (
          <p className="text-sm text-muted-foreground">No availability on this day — try another date.</p>
        )}
      </div>
    </div>
  );
}
