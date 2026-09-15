import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addTimeOffAction,
  addWorkingHoursAction,
  deleteTimeOffAction,
  deleteWorkingHoursAction,
} from "@/lib/actions/admin";
import { QualificationCheckbox } from "@/components/admin/qualification-checkbox";
import type { Cleaner, Service, TimeOff, WorkingHours } from "@/lib/types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function CleanerDetailPage({ params }: { params: Promise<{ cleanerId: string }> }) {
  const { cleanerId } = await params;
  const supabase = await createClient();

  const [{ data: cleaner }, { data: services }, { data: qualifications }, { data: workingHours }, { data: timeOff }] =
    await Promise.all([
      supabase.from("PS_CLEAN_cleaners").select("*").eq("id", cleanerId).maybeSingle(),
      supabase.from("PS_CLEAN_services").select("*").eq("is_active", true).order("name"),
      supabase.from("PS_CLEAN_cleaner_services").select("service_id").eq("cleaner_id", cleanerId),
      supabase.from("PS_CLEAN_cleaner_working_hours").select("*").eq("cleaner_id", cleanerId).order("day_of_week"),
      supabase.from("PS_CLEAN_cleaner_time_off").select("*").eq("cleaner_id", cleanerId).order("starts_at"),
    ]);

  if (!cleaner) notFound();

  const qualifiedServiceIds = new Set((qualifications ?? []).map((q) => q.service_id));

  async function addHours(formData: FormData) {
    "use server";
    await addWorkingHoursAction({
      cleanerId,
      dayOfWeek: Number(formData.get("dayOfWeek")),
      startTime: String(formData.get("startTime")),
      endTime: String(formData.get("endTime")),
    });
  }

  async function addOff(formData: FormData) {
    "use server";
    await addTimeOffAction({
      cleanerId,
      startsAt: new Date(String(formData.get("startsAt"))).toISOString(),
      endsAt: new Date(String(formData.get("endsAt"))).toISOString(),
      reason: String(formData.get("reason") ?? "") || undefined,
    });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">{(cleaner as Cleaner).full_name}</h1>

      <section className="mt-6">
        <h2 className="font-semibold text-foreground">Qualified services</h2>
        <div className="mt-2 space-y-1">
          {(services ?? []).map((s: Service) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <QualificationCheckbox
                cleanerId={cleanerId}
                serviceId={s.id}
                initiallyQualified={qualifiedServiceIds.has(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold text-foreground">Working hours</h2>
        <div className="mt-2 space-y-1">
          {((workingHours ?? []) as WorkingHours[]).map((wh) => (
            <div key={wh.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <span>
                {DAYS[wh.day_of_week]}: {wh.start_time.slice(0, 5)}–{wh.end_time.slice(0, 5)}
              </span>
              <form
                action={async () => {
                  "use server";
                  await deleteWorkingHoursAction(wh.id);
                }}
              >
                <button type="submit" className="text-xs text-danger hover:underline">
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
        <form action={addHours} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            Day
            <select name="dayOfWeek" className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm">
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Start
            <input name="startTime" type="time" required defaultValue="09:00" className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            End
            <input name="endTime" type="time" required defaultValue="17:00" className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-lg bg-muted px-3 py-1.5 text-sm font-medium">
            Add
          </button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold text-foreground">Time off</h2>
        <div className="mt-2 space-y-1">
          {((timeOff ?? []) as TimeOff[]).map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <span>
                {new Date(t.starts_at).toLocaleString("en-GB")} – {new Date(t.ends_at).toLocaleString("en-GB")}
                {t.reason ? ` (${t.reason})` : ""}
              </span>
              <form
                action={async () => {
                  "use server";
                  await deleteTimeOffAction(t.id);
                }}
              >
                <button type="submit" className="text-xs text-danger hover:underline">
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
        <form action={addOff} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            From
            <input name="startsAt" type="datetime-local" required className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input name="endsAt" type="datetime-local" required className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm" />
          </label>
          <input name="reason" placeholder="Reason (optional)" className="mt-1 rounded-lg border border-border px-2 py-1.5 text-sm" />
          <button type="submit" className="rounded-lg bg-muted px-3 py-1.5 text-sm font-medium">
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
