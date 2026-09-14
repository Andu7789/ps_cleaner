"use client";

import { useEffect, useState } from "react";
import { resumeBookingPaymentAction } from "@/lib/actions/booking";
import { PaymentStep } from "@/components/booking/payment-step";

export function ResumePayment({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; clientSecret: string; amountDuePence: number }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    resumeBookingPaymentAction(bookingId)
      .then((result) => {
        if (!cancelled) setState({ status: "ready", ...result });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : "Couldn't start payment" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Preparing payment…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-danger">{state.message}</p>;
  }
  return (
    <PaymentStep bookingId={bookingId} clientSecret={state.clientSecret} amountDuePence={state.amountDuePence} />
  );
}
