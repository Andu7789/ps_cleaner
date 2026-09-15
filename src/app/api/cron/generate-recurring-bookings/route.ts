import { zonedTimeToUtc } from "@/lib/calendar";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Generates the next occurrence for each active recurring series once it's
// due within GENERATION_WINDOW_DAYS — far enough ahead that a customer sees
// their regular slot confirmed well before it happens, close enough that a
// far-future working-hours/cleaner change is unlikely to have made it stale.
const GENERATION_WINDOW_DAYS = 14;

function advanceDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "fortnightly") d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

async function handler(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const service = createServiceClient();
  const windowEnd = new Date(Date.now() + GENERATION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: due, error } = await service
    .from("PS_CLEAN_recurring_bookings")
    .select("id, customer_id, cleaner_id, service_id, address_id, frequency, time_of_day, next_occurrence_date")
    .eq("is_active", true)
    .lte("next_occurrence_date", windowEnd);

  if (error) return new Response(error.message, { status: 500 });

  let generated = 0;
  let failed = 0;

  for (const series of due ?? []) {
    // Interpreted in the cleaner's own working-hours timezone, same
    // pattern ps_clean_create_booking itself uses — a recurring "every
    // Tuesday at 9am" must stay 9am local across the BST/GMT boundary.
    const { data: wh } = await service
      .from("PS_CLEAN_cleaner_working_hours")
      .select("timezone")
      .eq("cleaner_id", series.cleaner_id)
      .limit(1)
      .maybeSingle();
    const tz = wh?.timezone ?? "Europe/London";

    const actualStartsAt = zonedTimeToUtc(series.next_occurrence_date, series.time_of_day, tz);

    const { data: booking, error: createError } = await service
      .rpc("ps_clean_create_booking", {
        p_customer_id: series.customer_id,
        p_cleaner_id: series.cleaner_id,
        p_service_id: series.service_id,
        p_address_id: series.address_id,
        p_starts_at: actualStartsAt.toISOString(),
        p_notes: null,
        p_addon_ids: [],
      })
      .single();

    if (createError || !booking) {
      failed++;
      await service
        .from("PS_CLEAN_recurring_bookings")
        .update({ last_generation_error: createError?.message ?? "Unknown error", updated_at: new Date().toISOString() })
        .eq("id", series.id);
      continue;
    }

    const typedBooking = booking as { id: string };
    await service.from("PS_CLEAN_bookings").update({ recurring_booking_id: series.id }).eq("id", typedBooking.id);
    await service
      .from("PS_CLEAN_recurring_bookings")
      .update({
        next_occurrence_date: advanceDate(series.next_occurrence_date, series.frequency),
        last_generation_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", series.id);
    generated++;
  }

  return Response.json({ checked: due?.length ?? 0, generated, failed });
}

// GET for Vercel Cron (only ever triggers via GET, auto-attaching this
// Authorization header for an env var literally named CRON_SECRET); POST
// for everything else (Cloudflare's scheduled() handler, manual triggering).
export const GET = handler;
export const POST = handler;
