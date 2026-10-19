import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { CheckoutForm } from "@/components/booking/checkout-form";
import type { Addon, Cleaner, Service } from "@/lib/types";

interface RoomSelection {
  roomTypeId: string;
  name: string;
  quantity: number;
  pricePerUnitPence: number;
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ cleanerId?: string; startsAt?: string; rooms?: string; returning?: string }>;
}) {
  const { serviceId } = await params;
  const { cleanerId, startsAt, rooms, returning } = await searchParams;
  if (!cleanerId || !startsAt) redirect(`/book/${serviceId}`);

  let roomSelections: RoomSelection[] = [];
  if (rooms) {
    try {
      const parsed = JSON.parse(rooms);
      if (Array.isArray(parsed)) roomSelections = parsed;
    } catch {
      // Malformed/tampered query param — ignore rather than error; the
      // server recomputes the real price from scratch either way, so this
      // only affects what's displayed, never what's charged.
    }
  }

  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const [{ data: service }, { data: cleaner }, { data: addonLinks }] = await Promise.all([
    supabase.from("PS_CLEAN_services").select("*").eq("id", serviceId).eq("business_id", business.id).maybeSingle(),
    supabase.from("PS_CLEAN_cleaners").select("*").eq("id", cleanerId).eq("business_id", business.id).maybeSingle(),
    supabase.from("PS_CLEAN_service_addons").select("PS_CLEAN_addons(*)").eq("service_id", serviceId),
  ]);

  if (!service || !cleaner) redirect(`/book/${serviceId}`);

  const addons = ((addonLinks ?? [])
    .map((row) => row.PS_CLEAN_addons)
    .filter(Boolean) as unknown as Addon[]).filter((a) => a.is_active);

  const backHref = `/book/${serviceId}${returning === "1" ? "?returning=1" : ""}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
        &larr; Change time or cleaner
      </Link>
      <h1 className="mt-4 text-xl font-semibold text-foreground">Confirm your booking</h1>
      <div className="mt-6">
        <CheckoutForm
          service={service as Service}
          cleanerId={(cleaner as Cleaner).id}
          cleanerName={(cleaner as Cleaner).full_name}
          startsAt={startsAt}
          addons={addons}
          roomSelections={roomSelections}
          returning={returning === "1"}
        />
      </div>
    </div>
  );
}
