"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripe-client";
import { formatPence } from "@/lib/format";

function ConfirmForm({ bookingId, amountDuePence }: { bookingId: string; amountDuePence: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPending(true);
    setError(null);

    // Required before confirmPayment — without it Stripe.js throws
    // "We could not retrieve data from the specified Element" because the
    // Payment Element's collected field values (and any wallet-specific
    // data, e.g. Apple/Google Pay) are never finalized for confirmPayment
    // to read. Easy to miss since older code samples predate this step.
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Please check your payment details and try again.");
      setPending(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed — please try again.");
      setPending(false);
      return;
    }

    router.push(`/book/confirmation?bookingId=${bookingId}`);
  }

  return (
    <form onSubmit={handleConfirm} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending || !stripe}
        className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Processing…" : `Pay ${formatPence(amountDuePence)}`}
      </button>
    </form>
  );
}

export function PaymentStep({
  bookingId,
  clientSecret,
  amountDuePence,
}: {
  bookingId: string;
  clientSecret: string;
  amountDuePence: number;
}) {
  return (
    <Elements stripe={getStripeClient()} options={{ clientSecret }}>
      <ConfirmForm bookingId={bookingId} amountDuePence={amountDuePence} />
    </Elements>
  );
}
