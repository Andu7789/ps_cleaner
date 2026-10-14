"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { formatDate, formatTime } from "@/lib/format";
import { sendQuoteApprovedEmails } from "@/lib/notify";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

// An owner confirms (or adjusts) the price of a booking that needs a quote.
// Only now does the booking's price change, and only now are the cleaner and
// the customer told. The ps_clean_set_booking_quote RPC enforces owner-only
// and refuses once the balance has been charged.
export async function approveQuoteAction(bookingId: string, priceGbp: number) {
  await requireOwner();
  if (!Number.isFinite(priceGbp) || priceGbp < 0) throw new Error("Enter a price in pounds, like 85 or 85.50");
  const pricePence = Math.round(priceGbp * 100);

  const supabase = await createClient();
  const { error } = await supabase.rpc("ps_clean_set_booking_quote", {
    p_booking_id: bookingId,
    p_price_pence: pricePence,
  });
  if (error) throw new Error(error.message);

  const service = createServiceClient();
  const { data } = await service
    .from("PS_CLEAN_bookings")
    .select(
      "starts_at, PS_CLEAN_customers(email), PS_CLEAN_cleaners(email), PS_CLEAN_services(name), PS_CLEAN_businesses(business_name)"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (data) {
    const customer = one(data.PS_CLEAN_customers as { email: string | null } | { email: string | null }[] | null);
    const cleaner = one(data.PS_CLEAN_cleaners as { email: string | null } | { email: string | null }[] | null);
    const svc = one(data.PS_CLEAN_services as { name: string } | { name: string }[] | null);
    const business = one(data.PS_CLEAN_businesses as { business_name: string } | { business_name: string }[] | null);
    if (business) {
      await sendQuoteApprovedEmails({
        businessName: business.business_name,
        serviceName: svc?.name ?? "Clean",
        dateLine: `${formatDate(data.starts_at)} at ${formatTime(data.starts_at)}`,
        pricePence,
        cleanerEmail: cleaner?.email ?? null,
        customerEmail: customer?.email ?? null,
      });
    }
  }

  revalidatePath("/cleaner", "layout");
  revalidatePath("/admin/bookings");
  revalidatePath("/account", "layout");
}
