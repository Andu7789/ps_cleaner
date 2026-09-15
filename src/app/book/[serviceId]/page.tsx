import { notFound } from "next/navigation";
import { Clock, PoundSterling } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, formatPence } from "@/lib/format";
import { SlotPicker } from "@/components/booking/slot-picker";
import type { CalculatorRoomType, Cleaner, CleanerRating, Service } from "@/lib/types";

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

  const cleanerIds = cleaners.map((c) => c.id);
  const { data: reviewRows } = cleanerIds.length
    ? await supabase.from("PS_CLEAN_reviews").select("cleaner_id, rating").in("cleaner_id", cleanerIds)
    : { data: [] };

  const ratings: Record<string, CleanerRating> = {};
  for (const id of cleanerIds) ratings[id] = { average_rating: null, review_count: 0 };
  for (const row of reviewRows ?? []) {
    const bucket = ratings[row.cleaner_id];
    const total = (bucket.average_rating ?? 0) * bucket.review_count + row.rating;
    bucket.review_count += 1;
    bucket.average_rating = Math.round((total / bucket.review_count) * 10) / 10;
  }

  let roomTypes: CalculatorRoomType[] = [];
  if ((service as Service).use_calculator) {
    const { data: roomTypeData } = await supabase
      .from("PS_CLEAN_calculator_room_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at");
    roomTypes = (roomTypeData ?? []) as CalculatorRoomType[];
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{(service as Service).name}</h1>
          {service.description && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{service.description}</p>}
        </div>
        <div className="flex shrink-0 gap-6 sm:flex-col sm:items-end sm:gap-1.5">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {formatDuration(service.duration_minutes)}
          </div>
          <div className="flex items-center gap-1.5 text-lg font-semibold text-brand">
            <PoundSterling className="h-4 w-4" aria-hidden="true" />
            {formatPence(service.price_pence).replace("£", "")}
          </div>
        </div>
      </div>
      {service.deposit_pence ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {formatPence(service.deposit_pence)} deposit at booking · remainder due before your clean
        </p>
      ) : null}

      <div className="mt-8">
        {cleaners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cleaners are currently qualified for this service.</p>
        ) : (
          <SlotPicker service={service as Service} cleaners={cleaners} ratings={ratings} roomTypes={roomTypes} />
        )}
      </div>
    </div>
  );
}
