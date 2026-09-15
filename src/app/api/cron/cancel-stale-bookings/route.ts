import { cancelBookingAsSystem } from "@/lib/bookings";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// A booking that fails payment gets cancelled immediately by the Stripe
// webhook (see /api/webhooks/stripe) — but a customer who just closes the
// tab mid-checkout, or whose card entry never resolves either way, leaves
// no event for that webhook to react to. Without this, that booking sits
// at 'pending_payment' forever, permanently holding its cleaner's slot.
// This is the cleanup for that gap: anything past STALE_AFTER_MINUTES with
// no payment ever having succeeded gets cancelled, freeing the slot for
// someone who can actually complete the booking.
const STALE_AFTER_MINUTES = 30;

async function handler(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const service = createServiceClient();
  const staleBefore = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000).toISOString();

  const { data: staleBookings, error } = await service
    .from("PS_CLEAN_bookings")
    .select("id")
    .eq("status", "pending_payment")
    .lt("created_at", staleBefore);

  if (error) return new Response(error.message, { status: 500 });

  for (const booking of staleBookings ?? []) {
    await cancelBookingAsSystem(service, booking.id, "Abandoned checkout (no payment completed)");
  }

  return Response.json({ cancelled: staleBookings?.length ?? 0 });
}

// GET for Vercel Cron (which only ever triggers via GET, and auto-attaches
// this same Authorization header when an env var is literally named
// CRON_SECRET); POST for everything else that calls this (Cloudflare's
// scheduled() handler, manual triggering).
export const GET = handler;
export const POST = handler;
