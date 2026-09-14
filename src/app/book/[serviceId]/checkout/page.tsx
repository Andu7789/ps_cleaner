import { redirect } from "next/navigation";
import { getCustomer, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "@/components/booking/checkout-form";
import type { Cleaner, CustomerAddress, Service } from "@/lib/types";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ cleanerId?: string; startsAt?: string }>;
}) {
  const { serviceId } = await params;
  const { cleanerId, startsAt } = await searchParams;
  if (!cleanerId || !startsAt) redirect(`/book/${serviceId}`);

  const currentUrl = `/book/${serviceId}/checkout?cleanerId=${cleanerId}&startsAt=${encodeURIComponent(startsAt)}`;

  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(currentUrl)}`);

  const customer = await getCustomer(user.id);
  if (!customer) redirect(`/account/setup?next=${encodeURIComponent(currentUrl)}`);

  const supabase = await createClient();
  const [{ data: service }, { data: cleaner }, { data: addresses }] = await Promise.all([
    supabase.from("PS_CLEAN_services").select("*").eq("id", serviceId).maybeSingle(),
    supabase.from("PS_CLEAN_cleaners").select("*").eq("id", cleanerId).maybeSingle(),
    supabase
      .from("PS_CLEAN_customer_addresses")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: true }),
  ]);

  if (!service || !cleaner) redirect(`/book/${serviceId}`);

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
        />
      </div>
    </div>
  );
}
