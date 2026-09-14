"use client";

import { useTransition } from "react";
import { adminSetBookingStatusAction } from "@/lib/actions/admin";
import type { BookingStatus } from "@/lib/types";

const STATUSES: BookingStatus[] = ["pending_payment", "confirmed", "completed", "no_show", "cancelled"];

export function BookingStatusSelect({ bookingId, status }: { bookingId: string; status: BookingStatus }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={pending}
      onChange={(e) => startTransition(() => adminSetBookingStatusAction(bookingId, e.target.value))}
      className="rounded-lg border border-border bg-card px-2 py-1 text-xs disabled:opacity-60"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}
