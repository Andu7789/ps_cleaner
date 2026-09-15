"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarX2, Star } from "lucide-react";
import { getAvailableSlotsAction } from "@/lib/actions/booking";
import { candidateStartTimes, groupByTimeOfDay } from "@/lib/slots";
import { toDateKey } from "@/lib/calendar";
import { formatTime } from "@/lib/format";
import { Calendar } from "@/components/booking/calendar";
import { WaitlistButton } from "@/components/booking/waitlist-button";
import type { Cleaner, CleanerRating, FreeSlotRange, Service } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function CleanerAvatar({ cleaner }: { cleaner: Cleaner }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: cleaner.calendar_color }}
      aria-hidden="true"
    >
      {initials(cleaner.full_name)}
    </span>
  );
}

function AvailabilitySkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2.5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((pill) => (
                <div key={pill} className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SlotPicker({
  service,
  cleaners,
  ratings,
}: {
  service: Service;
  cleaners: Cleaner[];
  ratings: Record<string, CleanerRating>;
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  // null = no successful fetch has landed yet for the current date. Kept
  // stale (not reset to null) across a date change so switching dates
  // doesn't flash a loading state — matches this workspace's convention
  // for on-demand client fetches (see Root Cafe's change-history.tsx).
  const [ranges, setRanges] = useState<FreeSlotRange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanerById = useMemo(() => new Map(cleaners.map((c) => [c.id, c])), [cleaners]);

  useEffect(() => {
    let cancelled = false;
    getAvailableSlotsAction(service.id, toDateKey(selectedDate))
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
          // Coarser than the RPC's own precision on purpose: 15-minute
          // granularity produces 15-20 nearly-identical buttons per
          // cleaner for a typical service, which reads as noise rather
          // than choice. 30 minutes is plenty of precision for booking a
          // multi-hour clean and keeps the list scannable.
          stepMinutes: 30,
        })
      );
    }
    return result;
  }, [ranges, service]);

  const availableCleaners = Array.from(slotsByCleanerId.entries()).filter(([, starts]) => starts.length > 0);

  function chooseSlot(cleanerId: string, startsAt: Date) {
    const params = new URLSearchParams({ cleanerId, startsAt: startsAt.toISOString() });
    router.push(`/book/${service.id}/checkout?${params.toString()}`);
  }

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr] md:gap-8">
      <div>
        <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">
          {selectedDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </h2>

        <div className="mt-4" key={toDateKey(selectedDate)}>
          {loading && <AvailabilitySkeleton />}

          {!loading && error && <p className="text-sm text-danger">{error}</p>}

          {!loading && !error && availableCleaners.length > 0 && (
            <div className="ps-clean-fade-in divide-y divide-border">
              {availableCleaners.map(([cleanerId, starts]) => {
                const cleaner = cleanerById.get(cleanerId);
                if (!cleaner) return null;
                return (
                  <div key={cleanerId} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                    <CleanerAvatar cleaner={cleaner} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{cleaner.full_name}</p>
                        {ratings[cleanerId]?.review_count > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                            {ratings[cleanerId].average_rating} ({ratings[cleanerId].review_count})
                          </span>
                        )}
                      </div>
                      <div className="mt-2.5 space-y-3">
                        {groupByTimeOfDay(starts).map((group) => (
                          <div key={group.label}>
                            <p className="text-xs text-muted-foreground">{group.label}</p>
                            <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {group.times.map((s) => (
                                <button
                                  key={s.toISOString()}
                                  type="button"
                                  onClick={() => chooseSlot(cleanerId, s)}
                                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-brand hover:bg-brand hover:text-brand-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                >
                                  {formatTime(s.toISOString())}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !error && availableCleaners.length === 0 && (
            <div className="ps-clean-fade-in flex flex-col items-center px-4 py-10 text-center">
              <CalendarX2 className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-foreground">No availability on this day</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try another date on the calendar — most days have open slots.
              </p>
              <WaitlistButton serviceId={service.id} wantedDate={toDateKey(selectedDate)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
