import { notFound, redirect } from "next/navigation";
import { Clock, PoundSterling } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { customerMinutes, findWalkthroughService, formatDuration, servicePriceLabel } from "@/lib/format";
import { SlotPicker } from "@/components/booking/slot-picker";
import type { CalculatorRoomType, Cleaner, CleanerRating, Service } from "@/lib/types";

export default async function ServiceBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ returning?: string }>;
}) {
  const { serviceId } = await params;
  const { returning } = await searchParams;
  const business = await getCurrentBusiness();
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("PS_CLEAN_services")
    .select("*")
    .eq("id", serviceId)
    .eq("business_id", business.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!service) notFound();

  // New customers can't book a walkthrough first service directly: send them
  // to book the walkthrough instead. Returning customers arrive with ?returning=1
  // (the booking action checks their email has booked before).
  if ((service as Service).walkthrough_first && returning !== "1") {
    const { data: others } = await supabase
      .from("PS_CLEAN_services")
      .select("*")
      .eq("business_id", business.id)
      .eq("is_active", true);
    const walkthrough = findWalkthroughService((others ?? []) as Service[]);
    redirect(walkthrough ? `/book/${walkthrough.id}` : "/book");
  }

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
      .eq("business_id", business.id)
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
            {formatDuration(customerMinutes(service as Service))}
          </div>
          <div className="flex items-center gap-1.5 text-lg font-semibold text-brand">
            {(service as Service).price_pence > 0 && <PoundSterling className="h-4 w-4" aria-hidden="true" />}
            {servicePriceLabel(service as Service).replace("£", "")}
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Nothing to pay when you book. We invoice you once the clean is done.
      </p>

      <div className="mt-8">
        {cleaners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cleaners are currently qualified for this service.</p>
        ) : (
          <SlotPicker
            service={service as Service}
            cleaners={cleaners}
            ratings={ratings}
            roomTypes={roomTypes}
            returning={returning === "1"}
          />
        )}
      </div>
    </div>
  );
}
