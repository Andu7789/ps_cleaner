import Link from "next/link";
import { requireCleaner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/format";
import { toLondonDateKey, zonedTimeToUtc } from "@/lib/calendar";
import type { Booking, CustomerAddress, RecurringBooking, Service } from "@/lib/types";

type JobRow = Booking & { PS_CLEAN_services: Service; PS_CLEAN_customer_addresses: CustomerAddress };
type RecurringRow = RecurringBooking & { PS_CLEAN_services: Service | null };

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Pure date-key arithmetic (no timezone conversion needed here — we're
// just walking calendar days), then zonedTimeToUtc() converts the actual
// day boundaries to real instants for the query, same pattern as the
// Today page. See DECISIONS.md #5.
function mondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const offset = (anchor.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  anchor.setUTCDate(anchor.getUTCDate() - offset);
  return anchor.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function CleanerSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { cleaner } = await requireCleaner();
  const { week } = await searchParams;
  const supabase = await createClient();

  const todayKey = toLondonDateKey(new Date().toISOString());
  const mondayKey = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : todayKey);
  const sundayKey = addDays(mondayKey, 6);
  const weekStart = zonedTimeToUtc(mondayKey, "00:00:00", "Europe/London");
  const weekEnd = zonedTimeToUtc(sundayKey, "23:59:59", "Europe/London");

  const [{ data: bookings }, { data: recurring }] = await Promise.all([
    supabase
      .from("PS_CLEAN_bookings")
      .select("*, PS_CLEAN_services(*), PS_CLEAN_customer_addresses(*)")
      .eq("cleaner_id", cleaner.id)
      .gte("starts_at", weekStart.toISOString())
      .lte("starts_at", weekEnd.toISOString())
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
    supabase
      .from("PS_CLEAN_recurring_bookings")
      .select("*, PS_CLEAN_services(name)")
      .eq("cleaner_id", cleaner.id)
      .eq("is_active", true)
      .order("next_occurrence_date", { ascending: true }),
  ]);

  const jobs = (bookings ?? []) as JobRow[];
  const jobsByDay = new Map<string, JobRow[]>();
  for (const job of jobs) {
    const key = toLondonDateKey(job.starts_at);
    jobsByDay.set(key, [...(jobsByDay.get(key) ?? []), job]);
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mondayKey, i));
  const weekLabel = `${new Date(`${mondayKey}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(`${sundayKey}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Your week</h1>
      <div className="mt-2 flex items-center justify-between text-sm">
        <Link href={`/cleaner/schedule?week=${addDays(mondayKey, -7)}`} className="text-brand hover:underline">
          &larr; Previous
        </Link>
        <span className="font-medium text-foreground">{weekLabel}</span>
        <Link href={`/cleaner/schedule?week=${addDays(mondayKey, 7)}`} className="text-brand hover:underline">
          Next &rarr;
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {weekDays.map((dayKey, i) => {
          const dayJobs = jobsByDay.get(dayKey) ?? [];
          const isToday = dayKey === todayKey;
          return (
            <div key={dayKey} className={`rounded-xl border p-3 ${isToday ? "border-brand bg-brand/5" : "border-border bg-card"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {DAY_LABELS[i]} {isToday ? "· Today" : ""}
              </p>
              {dayJobs.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {dayJobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/cleaner/bookings/${job.id}`}
                      className="block rounded-lg bg-background px-3 py-2 text-sm transition hover:border-brand"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                          {formatTime(job.starts_at)} &middot; {job.PS_CLEAN_services.name}
                        </span>
                        {job.recurring_booking_id && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Recurring</span>
                        )}
                      </div>
                      <p className="text-muted-foreground">
                        {job.PS_CLEAN_customer_addresses.line1}, {job.PS_CLEAN_customer_addresses.postcode}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No jobs</p>
              )}
            </div>
          );
        })}
      </div>

      {((recurring ?? []) as RecurringRow[]).length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">Your regular customers</h2>
          <div className="mt-2 space-y-2">
            {((recurring ?? []) as RecurringRow[]).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span>{r.PS_CLEAN_services?.name ?? "Clean"}</span>
                <span className="text-muted-foreground">
                  {r.frequency === "weekly" ? "Weekly" : r.frequency === "fortnightly" ? "Every 2 weeks" : "Monthly"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
