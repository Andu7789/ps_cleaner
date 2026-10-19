import { timingSafeEqual } from "node:crypto";
import { ownerEmails } from "@/lib/booking-notify";
import { getBusinessOrigin } from "@/lib/business";
import { formatDate, formatTime } from "@/lib/format";
import { sendOwnerAlert } from "@/lib/notify";
import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// A job still not marked complete this long after its end time warns the owner.
const GRACE_MINUTES = 15;
// Older jobs are left alone, so switching this on doesn't email about every
// past job that was never ticked off.
const LOOKBACK_HOURS = 24;

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Called every 5 minutes by pg_cron in Supabase (migration 0052) with the key
// it keeps in PS_CLEAN_private_settings. Also accepts CRON_SECRET like the
// other scheduled routes, for calling by hand.
async function authorised(request: Request, service: SupabaseClient): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && same(request.headers.get("authorization") ?? "", `Bearer ${cronSecret}`)) return true;
  const key = request.headers.get("x-cron-key");
  if (!key) return false;
  const { data } = await service.from("PS_CLEAN_private_settings").select("value").eq("key", "cron_key").maybeSingle();
  return Boolean(data?.value) && same(key, data!.value);
}

async function handler(request: Request) {
  const service = createServiceClient();
  if (!(await authorised(request, service))) return new Response("Unauthorized", { status: 401 });

  const now = Date.now();
  const { data: jobs, error } = await service
    .from("PS_CLEAN_bookings")
    .select(
      "id, reference, business_id, starts_at, ends_at, PS_CLEAN_cleaners(full_name, phone), PS_CLEAN_customers(full_name), PS_CLEAN_services(name), PS_CLEAN_businesses(business_name, slug, custom_domain)"
    )
    .eq("status", "confirmed")
    .is("overdue_alert_sent_at", null)
    .lte("ends_at", new Date(now - GRACE_MINUTES * 60_000).toISOString())
    .gte("ends_at", new Date(now - LOOKBACK_HOURS * 3_600_000).toISOString());
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const job of jobs ?? []) {
    // Claim it first so two overlapping runs can't both email.
    const { data: claimed } = await service
      .from("PS_CLEAN_bookings")
      .update({ overdue_alert_sent_at: new Date().toISOString() })
      .eq("id", job.id)
      .is("overdue_alert_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const cleaner = one(job.PS_CLEAN_cleaners as { full_name: string; phone: string | null } | { full_name: string; phone: string | null }[] | null);
    const customer = one(job.PS_CLEAN_customers as { full_name: string | null } | { full_name: string | null }[] | null);
    const svc = one(job.PS_CLEAN_services as { name: string } | { name: string }[] | null);
    type B = { business_name: string; slug: string; custom_domain: string | null };
    const business = one(job.PS_CLEAN_businesses as B | B[] | null);
    if (!business) continue;

    await sendOwnerAlert(
      business.business_name,
      await ownerEmails(service, job.business_id),
      `Not marked complete: ${svc?.name ?? "Clean"} for ${customer?.full_name ?? "a customer"}`,
      [
        `The ${svc?.name ?? "clean"} for ${customer?.full_name ?? "a customer"} (reference ${job.reference}) was due to finish at ${formatTime(job.ends_at)} on ${formatDate(job.ends_at)}, and ${cleaner?.full_name ?? "the cleaner"} still hasn't marked it complete.`,
        cleaner?.phone ? `You can call ${cleaner.full_name} on ${cleaner.phone}.` : "",
      ].filter(Boolean),
      { url: `${getBusinessOrigin(business)}/admin/bookings/${job.id}`, label: "View the booking" }
    );
    sent++;
  }

  return Response.json({ checked: jobs?.length ?? 0, sent });
}

export const GET = handler;
export const POST = handler;
