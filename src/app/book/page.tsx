import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { ServiceList } from "@/components/service-list";
import type { Service } from "@/lib/types";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;
  if (service) redirect(`/book/${service}`);

  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_services")
    .select("*")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("price_pence", { ascending: true });
  const services = (data ?? []) as Service[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold text-foreground">Choose a service</h1>
      <div className="mt-4">
        <ServiceList services={services} />
      </div>
    </div>
  );
}
