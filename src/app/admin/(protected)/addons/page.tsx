import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { formatPence } from "@/lib/format";
import { createAddonAction, setAddonActiveAction } from "@/lib/actions/addons";
import { ToggleActiveButton } from "@/components/admin/toggle-active-button";
import { AddonServiceCheckbox } from "@/components/admin/addon-service-checkbox";
import type { Addon, Service } from "@/lib/types";

export default async function AdminAddonsPage() {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const [{ data: addons }, { data: services }, { data: links }] = await Promise.all([
    supabase.from("PS_CLEAN_addons").select("*").eq("business_id", business.id).order("created_at", { ascending: true }),
    supabase.from("PS_CLEAN_services").select("*").eq("business_id", business.id).eq("is_active", true).order("name"),
    supabase.from("PS_CLEAN_service_addons").select("service_id, addon_id").eq("business_id", business.id),
  ]);

  const linkSet = new Set((links ?? []).map((l) => `${l.service_id}:${l.addon_id}`));

  async function addAddon(formData: FormData) {
    "use server";
    await createAddonAction({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || undefined,
      pricePence: Math.round(Number(formData.get("price") ?? 0) * 100),
    });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Add-ons</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Extras customers can add to a booking at checkout, e.g. inside-oven clean or ironing.
      </p>

      <div className="mt-4 space-y-2">
        {(addons ?? []).map((addon: Addon) => (
          <div key={addon.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{addon.name}</p>
                <p className="text-sm text-muted-foreground">{formatPence(addon.price_pence)}</p>
              </div>
              <ToggleActiveButton isActive={addon.is_active} onToggle={setAddonActiveAction.bind(null, addon.id)} />
            </div>
            {(services ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3">
                {(services ?? []).map((service: Service) => (
                  <label key={service.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <AddonServiceCheckbox
                      serviceId={service.id}
                      addonId={addon.id}
                      initiallyOffered={linkSet.has(`${service.id}:${addon.id}`)}
                    />
                    {service.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        {(addons ?? []).length === 0 && <p className="text-sm text-muted-foreground">No add-ons yet.</p>}
      </div>

      <form action={addAddon} className="mt-8 space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Add an add-on</h2>
        <input name="name" required placeholder="Name (e.g. Inside oven clean)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <textarea name="description" placeholder="Description (optional)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <label className="block text-xs text-muted-foreground">
          Price (£)
          <input name="price" type="number" required min={0} step={0.01} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
          Add
        </button>
      </form>
    </div>
  );
}
