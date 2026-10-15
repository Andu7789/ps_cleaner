import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { formatDuration, formatPence } from "@/lib/format";
import { deleteServiceAction, setServiceActiveAction } from "@/lib/actions/admin";
import { ServiceForm } from "@/components/admin/service-form";
import { ServiceEditor } from "@/components/admin/service-editor";
import { ToggleActiveButton } from "@/components/admin/toggle-active-button";
import { DeleteButton } from "@/components/admin/delete-button";
import { ServiceCalculatorToggle } from "@/components/admin/service-calculator-toggle";
import { RoomTypesManager } from "@/components/admin/room-types-manager";
import type { CalculatorRoomType, Service } from "@/lib/types";

export default async function AdminServicesPage() {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const [{ data }, { data: roomTypeData }] = await Promise.all([
    supabase.from("PS_CLEAN_services").select("*").eq("business_id", business.id).order("created_at", { ascending: true }),
    supabase
      .from("PS_CLEAN_calculator_room_types")
      .select("*")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("created_at"),
  ]);
  const services = (data ?? []) as Service[];
  const roomTypes = (roomTypeData ?? []) as CalculatorRoomType[];

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Services</h1>

      <div className="mt-4 space-y-2">
        {services.map((s) => (
          <div key={s.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{s.name}</p>
              <p className="text-sm text-muted-foreground">
                {s.customer_duration_minutes
                  ? `${formatDuration(s.customer_duration_minutes)} shown to customers, ${formatDuration(s.duration_minutes)} in the diary`
                  : formatDuration(s.duration_minutes)}{" "}
                · {s.price_pence <= 0 ? "Free" : formatPence(s.price_pence)}
                {s.hourly_rate_pence != null ? ` (${formatPence(s.hourly_rate_pence)} an hour)` : ""}
                {s.price_is_from ? " (shown as from price)" : ""}
                {s.requires_quote ? " (exact quote needed)" : ""}
                {s.is_featured ? " (stand out button)" : ""}
 · buffers {s.buffer_before_minutes}m
                before / {s.buffer_after_minutes}m after
              </p>
              <ServiceEditor service={s} />
              <div className="mt-1">
                <ServiceCalculatorToggle
                  serviceId={s.id}
                  initialEnabled={s.use_calculator}
                  initialNoCharge={s.rooms_no_charge}
                  initialRequiresQuote={s.requires_quote}
                />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <ToggleActiveButton isActive={s.is_active} onToggle={setServiceActiveAction.bind(null, s.id)} />
              <DeleteButton name={s.name} onDelete={deleteServiceAction.bind(null, s.id)} />
            </div>
          </div>
        ))}
        {services.length === 0 && <p className="text-sm text-muted-foreground">No services yet.</p>}
      </div>

      <div className="mt-8">
        <RoomTypesManager roomTypes={roomTypes} />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold text-foreground">Add a service</h2>
        <ServiceForm />
      </div>
    </div>
  );
}
