// Pure calendar-grid math for the booking date picker. Kept separate from
// the Calendar component so the month-grid/boundary logic (the part most
// likely to have an off-by-one) can be unit tested without React.

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

// Same idea as toDateKey, but for server-side code that has no reason to
// be running in Europe/London itself (Vercel's Node runtime is UTC) —
// toDateKey's getFullYear()/getMonth()/getDate() would read the SERVER's
// local time there, which is wrong. Used wherever a timestamptz instant
// (e.g. a booking's starts_at) needs to become the LOCAL calendar day a
// customer meant, such as matching it against a waitlist entry's
// wanted_date. `Intl.DateTimeFormat` with an explicit timeZone is the
// correct tool here — no date library needed for just this.
const londonDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toLondonDateKey(iso: string): string {
  // en-CA formats as YYYY-MM-DD directly, which is exactly toDateKey's format.
  return londonDateFormatter.format(new Date(iso));
}

// The inverse of toLondonDateKey: given a wall-clock date+time meant in a
// specific IANA zone, returns the actual UTC instant — e.g. "09:00 on 15
// July in Europe/London" (BST, UTC+1) becomes 08:00 UTC. Standard
// no-library technique: treat the wall-clock value as if it were already
// UTC, see how that instant displays back in the target zone, and the
// difference between the two IS that zone's offset at that moment (DST
// included) — then subtract it. Used for recurring-booking generation,
// where "every Tuesday at 9am" must stay 9am local across the BST/GMT
// boundary rather than drifting by an hour twice a year.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateStr}T${timeStr}Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(naiveUtc).map((p) => [p.type, p.value]));
  // Some locales/environments render midnight as "24" rather than "00".
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  const offsetMs = asUtc - naiveUtc.getTime();
  return new Date(naiveUtc.getTime() - offsetMs);
}

// Monday-first week grid covering monthAnchor's whole month, padded with
// the adjacent months' days needed to fill complete weeks. No upper bound
// on how far ahead a customer can book — a cleaner's working hours are a
// recurring weekly pattern with no natural end date, so there's nothing
// that makes a date 6 months out any less valid than one next week.
export function getCalendarWeeks(monthAnchor: Date, today: Date): CalendarDay[][] {
  const todayStart = startOfDay(today);

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
      isSelectable: date.getTime() >= todayStart.getTime(),
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
