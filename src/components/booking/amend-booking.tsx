"use client";

import { useState, useTransition } from "react";
import { getRescheduleOptionsAction, rescheduleBookingAction, type RescheduleOptions } from "@/lib/actions/booking";
import { formatDate, formatTime } from "@/lib/format";
import { SlotPicker } from "@/components/booking/slot-picker";
import type { Cleaner } from "@/lib/types";

const button =
  "rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

// Customers have no accounts, so their booking reference is how they find
// their booking. They then pick a new time on the same availability calendar
// used for booking.
export function AmendBooking() {
  const [options, setOptions] = useState<RescheduleOptions | null>(null);
  const [choice, setChoice] = useState<{ cleanerId: string; startsAt: Date } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function lookUp(formData: FormData) {
    const reference = String(formData.get("reference") ?? "");
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const found = await getRescheduleOptionsAction(reference).catch(() => null);
      if (!found) {
        setError("We couldn't find a booking with that reference. Please check it against your confirmation email.");
        return;
      }
      setOptions(found);
      setChoice(null);
    });
  }

  function confirmMove() {
    if (!options || !choice) return;
    setError(null);
    startTransition(async () => {
      try {
        const updated = await rescheduleBookingAction(options.booking.reference, choice.cleanerId, choice.startsAt.toISOString());
        if ("error" in updated) {
          setError(updated.error);
          return;
        }
        setOptions({ ...options, booking: updated });
        setChoice(null);
        setMessage(`Done. Your booking is now ${formatDate(updated.startsAt)} at ${formatTime(updated.startsAt)}. We've emailed you to confirm.`);
      } catch {
        setError("Couldn't move your booking. Please check your connection and try again.");
      }
    });
  }

  if (!options) {
    return (
      <form action={lookUp} className="max-w-md rounded-xl border border-border bg-card p-5">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Booking reference</span>
          <input
            name="reference"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="e.g. K7QM2XPA"
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-lg uppercase tracking-[0.15em] text-foreground"
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={`mt-4 w-full ${button}`}>
          {pending ? "Finding your booking…" : "Find my booking"}
        </button>
      </form>
    );
  }

  const { booking, service, cleaners } = options;
  const cleanerName = (id: string) => cleaners.find((c) => c.id === id)?.full_name ?? "your cleaner";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Booking {booking.reference}</p>
        <h2 className="mt-1 font-semibold text-foreground">{booking.serviceName}</h2>
        <p className="mt-1 text-sm text-foreground">
          {formatDate(booking.startsAt)} at {formatTime(booking.startsAt)} with {booking.cleanerName}
        </p>
        {message && (
          <p role="status" className="mt-3 text-sm font-medium text-success">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setOptions(null);
            setMessage(null);
            setError(null);
          }}
          className="mt-3 text-sm text-brand hover:underline"
        >
          Use a different reference
        </button>
      </div>

      {!booking.canChange ? (
        <p className="text-sm text-muted-foreground">
          This booking can&apos;t be changed online any more. Please give us a call and we&apos;ll help.
        </p>
      ) : choice ? (
        <div className="max-w-md rounded-xl border border-brand bg-card p-5">
          <h2 className="font-semibold text-foreground">Move your booking to</h2>
          <p className="mt-1 text-sm text-foreground">
            {formatDate(choice.startsAt.toISOString())} at {formatTime(choice.startsAt.toISOString())} with{" "}
            {cleanerName(choice.cleanerId)}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={confirmMove} disabled={pending} className={button}>
              {pending ? "Moving…" : "Confirm new time"}
            </button>
            <button
              type="button"
              onClick={() => setChoice(null)}
              disabled={pending}
              className="rounded-lg border border-border px-4 py-2 font-medium text-foreground"
            >
              Pick another
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="mb-4 font-semibold text-foreground">Choose a new date and time</h2>
          <SlotPicker
            service={service}
            cleaners={cleaners as Cleaner[]}
            ratings={{}}
            durationMinutes={booking.durationMinutes}
            onChoose={(cleanerId, startsAt) => setChoice({ cleanerId, startsAt })}
          />
        </div>
      )}
    </div>
  );
}
