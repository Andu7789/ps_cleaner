import Link from "next/link";
import { requireCleaner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/format";
import { toLondonDateKey, zonedTimeToUtc } from "@/lib/calendar";
import type { Booking, CustomerAddress, Service } from "@/lib/types";

type JobRow = Booking & { PS_CLEAN_services: Service; PS_CLEAN_customer_addresses: CustomerAddress };

export default async function CleanerTodayPage() {
  const { cleaner } = await requireCleaner();
  const supabase = await createClient();

  // Working hours (and now this) are Europe/London wall-clock, not the
  // server's own local time — Vercel's functions run in UTC, so naively
  // using `new Date().setHours(0,0,0,0)` would draw the day boundary an
  // hour off during BST. See DECISIONS.md #5.
  const dateKey = toLondonDateKey(new Date().toISOString());
  const dayStart = zonedTimeToUtc(dateKey, "00:00:00", "Europe/London");
  const dayEnd = zonedTimeToUtc(dateKey, "23:59:59", "Europe/London");

  const { data } = await supabase
    .from("PS_CLEAN_bookings")
    .select("*, PS_CLEAN_services(*), PS_CLEAN_customer_addresses(*)")
    .eq("cleaner_id", cleaner.id)
    .gte("starts_at", dayStart.toISOString())
    .lte("starts_at", dayEnd.toISOString())
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });

  const jobs = (data ?? []) as JobRow[];

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Today&apos;s jobs</h1>
      <p className="text-sm text-muted-foreground">
        {jobs.length} scheduled &middot;{" "}
        {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })}
      </p>

      <div className="mt-4 space-y-3">
        {jobs.map((job) => (
          <Link
            key={job.id}
            href={`/cleaner/bookings/${job.id}`}
            className="block rounded-xl border border-border bg-card p-4 transition hover:border-brand"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">{formatTime(job.starts_at)}</span>
              <span
                className={`text-xs capitalize ${job.status === "completed" ? "text-success" : "text-muted-foreground"}`}
              >
                {job.status.replace("_", " ")}
              </span>
            </div>
            <p className="mt-1 text-sm text-foreground">{job.PS_CLEAN_services.name}</p>
            <p className="text-sm text-muted-foreground">
              {job.PS_CLEAN_customer_addresses.line1}, {job.PS_CLEAN_customer_addresses.postcode}
            </p>
          </Link>
        ))}
        {jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs today.</p>}
      </div>
    </div>
  );
}
