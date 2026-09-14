import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, formatPence } from "@/lib/format";
import { SlotPicker } from "@/components/booking/slot-picker";
import type { Cleaner, Service } from "@/lib/types";

export default async function ServiceBookingPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("PS_CLEAN_services")
    .select("*")
    .eq("id", serviceId)
    .eq("is_active", true)
    .maybeSingle();
  if (!service) notFound();

  const { data: cleanerLinks } = await supabase
    .from("PS_CLEAN_cleaner_services")
    .select("PS_CLEAN_cleaners(*)")
    .eq("service_id", serviceId);

  const cleaners = ((cleanerLinks ?? [])
    .map((row) => row.PS_CLEAN_cleaners)
    .filter(Boolean) as unknown as Cleaner[]).filter((c) => c.is_active);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-xl border border-border bg-card p-5">
        <h1 className="text-xl font-semibold text-foreground">{(service as Service).name}</h1>
        {service.description && <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>}
        <div className="mt-3 flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{formatDuration(service.duration_minutes)}</span>
          <span className="font-semibold text-brand">{formatPence(service.price_pence)}</span>
          {service.deposit_pence ? (
            <span className="text-muted-foreground">({formatPence(service.deposit_pence)} deposit)</span>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {cleaners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cleaners are currently qualified for this service.</p>
        ) : (
          <SlotPicker service={service as Service} cleaners={cleaners} />
        )}
      </div>
    </div>
  );
}
