import { createClient } from "@/lib/supabase/server";
import { formatDuration, formatPence } from "@/lib/format";
import { createServiceAction, setServiceActiveAction } from "@/lib/actions/admin";
import { ToggleActiveButton } from "@/components/admin/toggle-active-button";
import { ServiceCalculatorToggle } from "@/components/admin/service-calculator-toggle";
import { RoomTypesManager } from "@/components/admin/room-types-manager";
import type { CalculatorRoomType, Service } from "@/lib/types";

export default async function AdminServicesPage() {
  const supabase = await createClient();
  const [{ data }, { data: roomTypeData }] = await Promise.all([
    supabase.from("PS_CLEAN_services").select("*").order("created_at", { ascending: true }),
    supabase.from("PS_CLEAN_calculator_room_types").select("*").order("sort_order").order("created_at"),
  ]);
  const services = (data ?? []) as Service[];
  const roomTypes = (roomTypeData ?? []) as CalculatorRoomType[];

  async function addService(formData: FormData) {
    "use server";
    await createServiceAction({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || undefined,
      durationMinutes: Number(formData.get("durationMinutes") ?? 60),
      bufferBeforeMinutes: Number(formData.get("bufferBeforeMinutes") ?? 0),
      bufferAfterMinutes: Number(formData.get("bufferAfterMinutes") ?? 0),
      pricePence: Math.round(Number(formData.get("price") ?? 0) * 100),
      depositPence: formData.get("deposit") ? Math.round(Number(formData.get("deposit")) * 100) : null,
    });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Services</h1>

      <div className="mt-4 space-y-2">
        {services.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
            <div>
              <p className="font-medium text-foreground">{s.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatDuration(s.duration_minutes)} · {formatPence(s.price_pence)}
                {s.deposit_pence ? ` (${formatPence(s.deposit_pence)} deposit)` : ""} · buffers{" "}
                {s.buffer_before_minutes}m before / {s.buffer_after_minutes}m after
              </p>
              <div className="mt-1">
                <ServiceCalculatorToggle serviceId={s.id} initialEnabled={s.use_calculator} />
              </div>
            </div>
            <ToggleActiveButton isActive={s.is_active} onToggle={setServiceActiveAction.bind(null, s.id)} />
          </div>
        ))}
        {services.length === 0 && <p className="text-sm text-muted-foreground">No services yet.</p>}
      </div>

      <div className="mt-8">
        <RoomTypesManager roomTypes={roomTypes} />
      </div>

      <form action={addService} className="mt-8 space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Add a service</h2>
        <input name="name" required placeholder="Name (e.g. Standard Clean)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <textarea name="description" placeholder="Description (optional)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            Duration (minutes)
            <input name="durationMinutes" type="number" required min={15} step={15} defaultValue={60} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Price (£)
            <input name="price" type="number" required min={0} step={0.01} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Deposit (£, optional — leave blank for full payment)
            <input name="deposit" type="number" min={0} step={0.01} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <div />
          <label className="text-xs text-muted-foreground">
            Buffer before (minutes)
            <input name="bufferBeforeMinutes" type="number" min={0} step={5} defaultValue={0} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Buffer after — travel time (minutes)
            <input name="bufferAfterMinutes" type="number" min={0} step={5} defaultValue={15} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
        </div>
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
          Add service
        </button>
      </form>
    </div>
  );
}
