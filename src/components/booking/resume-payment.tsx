"use client";

import { useEffect, useState } from "react";
import { payQuotedBookingAction, resumeBookingPaymentAction } from "@/lib/actions/booking";
import { PaymentStep } from "@/components/booking/payment-step";

// `quoted` is for a confirmed quote booking paying for the first
// time; otherwise this resumes an unfinished checkout payment.
export function ResumePayment({ bookingId, quoted = false }: { bookingId: string; quoted?: boolean }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; clientSecret: string; amountDuePence: number }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (quoted ? payQuotedBookingAction(bookingId) : resumeBookingPaymentAction(bookingId))
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
  }, [bookingId, quoted]);

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
