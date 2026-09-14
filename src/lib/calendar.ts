// Pure calendar-grid math for the booking date picker. Kept separate from
// the Calendar component so the month-grid/window-boundary logic (the part
// most likely to have an off-by-one) can be unit tested without React.

export interface CalendarDay {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isSelectable: boolean;
}

// Local (not UTC) date parts, deliberately — this app runs in one timezone
// (Europe/London) and a calendar day is a wall-clock concept. Using
// toISOString() here would round to UTC and could report "yesterday"
// during the first hour after midnight in BST. See DECISIONS.md #5.
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function windowEndFor(today: Date, windowDays: number): Date {
  const end = startOfDay(today);
  end.setDate(end.getDate() + windowDays - 1);
  return end;
}

// Monday-first week grid covering monthAnchor's whole month, padded with
// the adjacent months' days needed to fill complete weeks.
export function getCalendarWeeks(monthAnchor: Date, today: Date, windowDays: number): CalendarDay[][] {
  const todayStart = startOfDay(today);
  const windowEnd = windowEndFor(today, windowDays);

  const firstOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const lastOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);

  // getDay() is 0=Sunday..6=Saturday; shift so Monday=0..Sunday=6.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const trailingBlanks = (7 - ((lastOfMonth.getDay() + 6) % 7) - 1) % 7;

  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - leadingBlanks);
  const gridEnd = new Date(lastOfMonth);
  gridEnd.setDate(gridEnd.getDate() + trailingBlanks);

  const days: CalendarDay[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    days.push({
      date,
      inMonth: date.getMonth() === monthAnchor.getMonth(),
      isToday: date.getTime() === todayStart.getTime(),
      isSelectable: date.getTime() >= todayStart.getTime() && date.getTime() <= windowEnd.getTime(),
    });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function canGoToPreviousMonth(monthAnchor: Date, today: Date): boolean {
  const todayStart = startOfDay(today);
  return (
    monthAnchor.getFullYear() > todayStart.getFullYear() ||
    (monthAnchor.getFullYear() === todayStart.getFullYear() && monthAnchor.getMonth() > todayStart.getMonth())
  );
}

export function canGoToNextMonth(monthAnchor: Date, today: Date, windowDays: number): boolean {
  const windowEnd = windowEndFor(today, windowDays);
  const firstOfNextMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1);
  return firstOfNextMonth.getTime() <= windowEnd.getTime();
}
