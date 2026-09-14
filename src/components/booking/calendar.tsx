"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { canGoToNextMonth, canGoToPreviousMonth, getCalendarWeeks, startOfDay, toDateKey } from "@/lib/calendar";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Calendar({
  selectedDate,
  onSelectDate,
  windowDays,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  windowDays: number;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [monthAnchor, setMonthAnchor] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  const weeks = useMemo(() => getCalendarWeeks(monthAnchor, today, windowDays), [monthAnchor, today, windowDays]);
  const canGoBack = canGoToPreviousMonth(monthAnchor, today);
  const canGoForward = canGoToNextMonth(monthAnchor, today, windowDays);
  const selectedKey = toDateKey(selectedDate);
  const todayKey = toDateKey(today);

  function selectDay(date: Date) {
    onSelectDate(date);
    if (date.getMonth() !== monthAnchor.getMonth() || date.getFullYear() !== monthAnchor.getFullYear()) {
      setMonthAnchor(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {monthAnchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous month"
            disabled={!canGoBack}
            onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={!canGoForward}
            onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="pb-2 text-xs font-medium text-muted-foreground">
            {label}
          </div>
        ))}

        {weeks.flat().map((day) => {
          const key = toDateKey(day.date);
          const isSelected = key === selectedKey;
          const isToday = key === todayKey;

          return (
            <div key={key} className="flex items-center justify-center py-0.5">
              <button
                type="button"
                disabled={!day.isSelectable}
                onClick={() => selectDay(day.date)}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isSelected}
                className={[
                  "relative flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors",
                  isSelected
                    ? "bg-brand font-semibold text-brand-foreground"
                    : day.isSelectable
                      ? day.inMonth
                        ? "text-foreground hover:bg-muted"
                        : "text-muted-foreground hover:bg-muted"
                      // Deliberately pale (the --border token, not a
                      // muted-foreground opacity trick) so "can't book
                      // this" reads unmistakably different at a glance
                      // from "bookable but not this month" just above.
                      : "cursor-not-allowed text-border",
                ].join(" ")}
              >
                {day.date.getDate()}
                {isToday && !isSelected && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand" aria-hidden="true" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
