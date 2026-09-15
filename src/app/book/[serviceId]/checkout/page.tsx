import { redirect } from "next/navigation";
import { getCustomer, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "@/components/booking/checkout-form";
import type { Addon, Cleaner, CustomerAddress, Service } from "@/lib/types";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ cleanerId?: string; startsAt?: string; rooms?: string }>;
}) {
  const { serviceId } = await params;
  const { cleanerId, startsAt, rooms } = await searchParams;
  if (!cleanerId || !startsAt) redirect(`/book/${serviceId}`);

  const currentUrl = `/book/${serviceId}/checkout?cleanerId=${cleanerId}&startsAt=${encodeURIComponent(startsAt)}${
    rooms ? `&rooms=${encodeURIComponent(rooms)}` : ""
  }`;

  interface RoomSelection {
    roomTypeId: string;
    name: string;
    quantity: number;
    pricePerUnitPence: number;
  }
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

  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(currentUrl)}`);

  const customer = await getCustomer(user.id);
  if (!customer) redirect(`/account/setup?next=${encodeURIComponent(currentUrl)}`);

  const supabase = await createClient();
  const [{ data: service }, { data: cleaner }, { data: addresses }, { data: addonLinks }, { data: creditBalance }] =
    await Promise.all([
      supabase.from("PS_CLEAN_services").select("*").eq("id", serviceId).maybeSingle(),
      supabase.from("PS_CLEAN_cleaners").select("*").eq("id", cleanerId).maybeSingle(),
      supabase
        .from("PS_CLEAN_customer_addresses")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: true }),
      supabase.from("PS_CLEAN_service_addons").select("PS_CLEAN_addons(*)").eq("service_id", serviceId),
      supabase.rpc("ps_clean_customer_credit_balance", { p_customer_id: customer.id }),
    ]);

  if (!service || !cleaner) redirect(`/book/${serviceId}`);

  const addons = ((addonLinks ?? [])
    .map((row) => row.PS_CLEAN_addons)
    .filter(Boolean) as unknown as Addon[]).filter((a) => a.is_active);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-foreground">Confirm your booking</h1>
      <div className="mt-6">
        <CheckoutForm
          customerId={customer.id}
          service={service as Service}
          cleanerId={(cleaner as Cleaner).id}
          cleanerName={(cleaner as Cleaner).full_name}
          startsAt={startsAt}
          addresses={(addresses ?? []) as CustomerAddress[]}
          addons={addons}
          creditBalancePence={creditBalance ?? 0}
          roomSelections={roomSelections}
        />
      </div>
    </div>
  );
}
