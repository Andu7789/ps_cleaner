"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBookingAction } from "@/lib/actions/booking";
import { formatDate, formatPence, formatServicePrice, formatTime } from "@/lib/format";
import type { Addon, BookingAccessMethod, Service } from "@/lib/types";

interface RoomSelection {
  roomTypeId: string;
  name: string;
  quantity: number;
  pricePerUnitPence: number;
}

interface Props {
  service: Service;
  cleanerId: string;
  cleanerName: string;
  startsAt: string;
  addons: Addon[];
  roomSelections?: RoomSelection[];
  // Came from the "Returning customer" card, so we ask for the email they used before.
  returning?: boolean;
}

const ACCESS_OPTIONS: { value: BookingAccessMethod; label: string }[] = [
  { value: "keys", label: "I will provide keys" },
  { value: "let_in", label: "I will let them in" },
  { value: "key_box", label: "I have a key box" },
];

const field = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground";

// Customers don't have accounts: they give their details here and are emailed
// a booking reference they can use to change the booking later. Nothing is
// paid online.
export function CheckoutForm({ service, cleanerId, cleanerName, startsAt, addons, roomSelections = [], returning = false }: Props) {
  const router = useRouter();
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [hasPets, setHasPets] = useState(false);
  const [accessMethod, setAccessMethod] = useState<BookingAccessMethod>("let_in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addonTotal = addons.filter((a) => selectedAddonIds.includes(a.id)).reduce((sum, a) => sum + a.price_pence, 0);
  const roomTotal = roomSelections.reduce((sum, r) => sum + r.quantity * r.pricePerUnitPence, 0);
  const grandTotal = service.price_pence + addonTotal + roomTotal;

  function toggleAddon(addonId: string) {
    setSelectedAddonIds((prev) => (prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]));
  }

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const text = (name: string) => String(formData.get(name) ?? "");
    try {
      const { reference } = await createBookingAction({
        cleanerId,
        serviceId: service.id,
        startsAt,
        fullName: text("fullName"),
        email: text("email"),
        phone: text("phone"),
        line1: text("line1"),
        line2: text("line2"),
        city: text("city"),
        postcode: text("postcode"),
        accessNotes: text("accessNotes"),
        addonIds: selectedAddonIds,
        parkingAvailable,
        hasPets,
        accessMethod,
        roomSelections: roomSelections.map((r) => ({ roomTypeId: r.roomTypeId, quantity: r.quantity })),
      });
      router.push(`/book/confirmation?ref=${encodeURIComponent(reference)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make this booking");
      setPending(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Your booking</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {service.name} with {cleanerName}
          <br />
          {formatDate(startsAt)} at {formatTime(startsAt)}
        </p>
        {roomSelections.length > 0 && (
          <ul className="mt-2 text-sm text-muted-foreground">
            {roomSelections.map((r) => (
              <li key={r.roomTypeId}>
                {r.quantity} × {r.name}
                {r.pricePerUnitPence > 0 ? ` (${formatPence(r.quantity * r.pricePerUnitPence)})` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm font-semibold text-brand">
          {service.requires_quote && grandTotal <= 0
            ? "This appointment is free. You'll be given a quote at the end of the walkthrough. Nothing to pay now."
            : "Nothing to pay now. We'll send you an invoice once your clean is complete."}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Your details</h2>
        {returning && (
          <p className="mt-1 text-sm text-muted-foreground">Please use the email address you booked with before.</p>
        )}
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-foreground">Full name</span>
            <input name="fullName" required autoComplete="name" className={`mt-1 ${field}`} />
          </label>
          <label className="block text-sm">
            <span className="text-foreground">Email</span>
            <input name="email" type="email" required autoComplete="email" className={`mt-1 ${field}`} />
            <span className="mt-1 block text-xs text-muted-foreground">We&apos;ll email your booking reference here.</span>
          </label>
          <label className="block text-sm">
            <span className="text-foreground">Phone</span>
            <input name="phone" type="tel" required autoComplete="tel" className={`mt-1 ${field}`} />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Address</h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-foreground">Address line 1</span>
            <input name="line1" required autoComplete="address-line1" className={`mt-1 ${field}`} />
          </label>
          <label className="block text-sm">
            <span className="text-foreground">
              Address line 2 <span className="text-muted-foreground">(optional)</span>
            </span>
            <input name="line2" autoComplete="address-line2" className={`mt-1 ${field}`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-foreground">Town or city</span>
              <input name="city" required autoComplete="address-level2" className={`mt-1 ${field}`} />
            </label>
            <label className="block text-sm">
              <span className="text-foreground">Postcode</span>
              <input name="postcode" required autoComplete="postal-code" className={`mt-1 ${field}`} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-foreground">
              Access notes <span className="text-muted-foreground">(optional)</span>
            </span>
            <textarea name="accessNotes" rows={2} className={`mt-1 ${field}`} />
          </label>
        </div>
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
                <span className="shrink-0 text-muted-foreground">{formatServicePrice(addon.price_pence)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Before your visit</h2>
        <div className="mt-3 space-y-4 text-sm">
          <ChoiceQuestion
            label="Is parking available nearby?"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            value={parkingAvailable ? "yes" : "no"}
            onChange={(v) => setParkingAvailable(v === "yes")}
          />
          <ChoiceQuestion
            label="Do you have any pets?"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            value={hasPets ? "yes" : "no"}
            onChange={(v) => setHasPets(v === "yes")}
          />
          <ChoiceQuestion
            label="How will your cleaner access the property?"
            options={ACCESS_OPTIONS}
            value={accessMethod}
            onChange={(v) => setAccessMethod(v as BookingAccessMethod)}
          />
          {accessMethod === "key_box" && (
            <p className="text-muted-foreground">We&apos;ll be in touch to take the key box code before your visit.</p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Booking…" : "Confirm booking"}
      </button>
    </form>
  );
}

function ChoiceQuestion({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="text-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-lg border px-3 py-1.5 font-medium ${
              value === o.value ? "border-brand bg-brand/5 text-foreground" : "border-border text-muted-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
