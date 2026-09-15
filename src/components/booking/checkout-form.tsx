"use client";

import { useState } from "react";
import { createBookingAction } from "@/lib/actions/booking";
import { addAddressAction } from "@/lib/actions/customer";
import { formatDate, formatPence, formatTime } from "@/lib/format";
import { PaymentStep } from "@/components/booking/payment-step";
import type { Addon, CustomerAddress, Service } from "@/lib/types";

interface Props {
  customerId: string;
  service: Service;
  cleanerId: string;
  cleanerName: string;
  startsAt: string;
  addresses: CustomerAddress[];
  addons: Addon[];
}

export function CheckoutForm({
  customerId,
  service,
  cleanerId,
  cleanerName,
  startsAt,
  addresses: initialAddresses,
  addons,
}: Props) {
  const [addresses] = useState(initialAddresses);
  const [addressId, setAddressId] = useState(initialAddresses.find((a) => a.is_default)?.id ?? initialAddresses[0]?.id ?? "");
  const [showNewAddress, setShowNewAddress] = useState(initialAddresses.length === 0);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<{ bookingId: string; clientSecret: string; amountDuePence: number } | null>(null);

  const addonTotal = addons.filter((a) => selectedAddonIds.includes(a.id)).reduce((sum, a) => sum + a.price_pence, 0);
  const grandTotal = service.price_pence + addonTotal;
  // A deposit covers only the base clean; add-ons ride along on whatever's
  // due now if there's no deposit, or get folded into the later balance if
  // there is one — one payment-timing rule, not two (see the migration
  // comment on ps_clean_create_booking for why).
  const amountDue = service.deposit_pence && service.deposit_pence > 0 ? service.deposit_pence : grandTotal;

  function toggleAddon(addonId: string) {
    setSelectedAddonIds((prev) => (prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]));
  }

  async function handleNewAddress(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await addAddressAction(customerId, {
        label: String(formData.get("label") ?? "Home"),
        line1: String(formData.get("line1") ?? ""),
        line2: String(formData.get("line2") ?? "") || undefined,
        city: String(formData.get("city") ?? ""),
        postcode: String(formData.get("postcode") ?? ""),
        accessNotes: String(formData.get("accessNotes") ?? "") || undefined,
        isDefault: addresses.length === 0,
      });
      // The server action revalidates /account/addresses, not this page — a
      // full reload is the simplest way to pick up the new row without
      // duplicating address-fetch logic here just for this one case.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that address");
      setPending(false);
    }
  }

  async function handleBookAndPay() {
    if (!addressId) {
      setError("Please choose or add an address first.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await createBookingAction({
        cleanerId,
        serviceId: service.id,
        addressId,
        startsAt,
        addonIds: selectedAddonIds,
      });
      if (!result.clientSecret) throw new Error("Couldn't start payment — please try again.");
      setBooking({ bookingId: result.bookingId, clientSecret: result.clientSecret, amountDuePence: result.amountDuePence });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create this booking");
    } finally {
      setPending(false);
    }
  }

  if (booking) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Payment</h2>
        <p className="mt-1 text-sm text-muted-foreground">Almost done — confirm payment to secure your slot.</p>
        <div className="mt-4">
          <PaymentStep
            bookingId={booking.bookingId}
            clientSecret={booking.clientSecret}
            amountDuePence={booking.amountDuePence}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Your booking</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {service.name} with {cleanerName}
          <br />
          {formatDate(startsAt)} at {formatTime(startsAt)}
        </p>
        <p className="mt-2 text-sm font-semibold text-brand">
          {formatPence(amountDue)} due now
          {service.deposit_pence ? ` (deposit — ${formatPence(grandTotal - service.deposit_pence)} due before your clean)` : ""}
        </p>
      </div>

      {addons.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground">Add extras</h2>
          <div className="mt-3 space-y-2">
            {addons.map((addon) => (
              <label key={addon.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <span className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 accent-brand"
                    checked={selectedAddonIds.includes(addon.id)}
                    onChange={() => toggleAddon(addon.id)}
                  />
                  <span>
                    <span className="font-medium text-foreground">{addon.name}</span>
                    {addon.description && <span className="block text-xs text-muted-foreground">{addon.description}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">{formatPence(addon.price_pence)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Address</h2>
        {addresses.length > 0 && (
          <div className="mt-3 space-y-2">
            {addresses.map((a) => (
              <label key={a.id} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="radio"
                  name="address"
                  checked={addressId === a.id}
                  onChange={() => setAddressId(a.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-foreground">{a.label}</span>
                  <br />
                  {a.line1}, {a.city} {a.postcode}
                </span>
              </label>
            ))}
          </div>
        )}
        {!showNewAddress ? (
          <button
            type="button"
            onClick={() => setShowNewAddress(true)}
            className="mt-3 text-sm text-brand hover:underline"
          >
            + Add a new address
          </button>
        ) : (
          <form action={handleNewAddress} className="mt-3 space-y-2">
            <input name="label" placeholder="Label (e.g. Home)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            <input name="line1" required placeholder="Address line 1" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            <input name="line2" placeholder="Address line 2 (optional)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <input name="city" required placeholder="City" className="w-1/2 rounded-lg border border-border px-3 py-2 text-sm" />
              <input name="postcode" required placeholder="Postcode" className="w-1/2 rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <textarea name="accessNotes" placeholder="Access notes (optional)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            <button type="submit" disabled={pending} className="rounded-lg bg-muted px-3 py-1.5 text-sm font-medium">
              Save address
            </button>
          </form>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={handleBookAndPay}
        disabled={pending || !addressId}
        className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Booking…" : "Continue to payment"}
      </button>
    </div>
  );
}
