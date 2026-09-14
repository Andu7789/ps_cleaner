import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addAddressAction, deleteAddressAction } from "@/lib/actions/customer";
import type { CustomerAddress } from "@/lib/types";

export default async function AddressesPage() {
  const { customer } = await requireCustomer();
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_customer_addresses")
    .select("*")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: true });
  const addresses = (data ?? []) as CustomerAddress[];

  async function addAddress(formData: FormData) {
    "use server";
    await addAddressAction(customer.id, {
      label: String(formData.get("label") ?? "Home"),
      line1: String(formData.get("line1") ?? ""),
      line2: String(formData.get("line2") ?? "") || undefined,
      city: String(formData.get("city") ?? ""),
      postcode: String(formData.get("postcode") ?? ""),
      accessNotes: String(formData.get("accessNotes") ?? "") || undefined,
      isDefault: addresses.length === 0,
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-foreground">Your addresses</h1>

      <div className="mt-4 space-y-3">
        {addresses.map((a) => (
          <div key={a.id} className="flex items-start justify-between rounded-xl border border-border bg-card p-4">
            <div>
              <p className="font-medium text-foreground">{a.label}</p>
              <p className="text-sm text-muted-foreground">
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.postcode}
              </p>
            </div>
            <form
              action={async () => {
                "use server";
                await deleteAddressAction(a.id);
              }}
            >
              <button type="submit" className="text-sm text-danger hover:underline">
                Remove
              </button>
            </form>
          </div>
        ))}
        {addresses.length === 0 && (
          <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
        )}
      </div>

      <form action={addAddress} className="mt-8 space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Add an address</h2>
        <input name="label" placeholder="Label (e.g. Home)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <input name="line1" required placeholder="Address line 1" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <input name="line2" placeholder="Address line 2 (optional)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <div className="flex gap-3">
          <input name="city" required placeholder="City" className="w-1/2 rounded-lg border border-border px-3 py-2 text-sm" />
          <input name="postcode" required placeholder="Postcode" className="w-1/2 rounded-lg border border-border px-3 py-2 text-sm" />
        </div>
        <textarea
          name="accessNotes"
          placeholder="Access notes for your cleaner (gate code, key location, pets, etc.)"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
          Save address
        </button>
      </form>
    </div>
  );
}
