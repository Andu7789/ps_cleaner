"use client";

import { useState, useTransition } from "react";
import { generateInvoiceAction, saveJobPricingAction, sendQuoteAction, type JobPricingInput } from "@/lib/actions/job-pricing";
import { estimatePricePence, formatDate, formatPence } from "@/lib/format";
import type { PaymentFormat } from "@/lib/types";

export interface PricingService {
  id: string;
  name: string;
  hourly_rate_pence: number | null;
  price_pence: number;
}

const input = "w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground";
const label = "block text-xs font-medium text-muted-foreground";

const toPounds = (pence: number | null) => (pence == null ? "" : (pence / 100).toFixed(2));
const toPence = (pounds: string) => (pounds.trim() === "" ? null : Math.round(Number(pounds) * 100));

// Under each booking on the admin list: what clean the job needs, how long,
// how it is paid, an estimate the owner can email as a quote, and the final
// price, emailed as an invoice once the job is done.
export function JobPricing({
  bookingId,
  services,
  initial,
  quoteSentAt,
  invoiceSentAt,
  completed,
  stacked = false,
}: {
  bookingId: string;
  services: PricingService[];
  initial: {
    serviceRequiredId: string | null;
    hoursRequired: number | null;
    paymentFormat: PaymentFormat | null;
    estimatedPricePence: number | null;
    finalPricePence: number | null;
  };
  quoteSentAt: string | null;
  invoiceSentAt: string | null;
  completed: boolean;
  // Two columns at most, for narrow pages like the booking detail.
  stacked?: boolean;
}) {
  const [serviceId, setServiceId] = useState(initial.serviceRequiredId ?? "");
  const [hours, setHours] = useState(initial.hoursRequired == null ? "" : String(initial.hoursRequired));
  const [format, setFormat] = useState<PaymentFormat | "">(initial.paymentFormat ?? "");
  const [estimate, setEstimate] = useState(toPounds(initial.estimatedPricePence));
  const [finalPrice, setFinalPrice] = useState(toPounds(initial.finalPricePence));
  const [quoteSent, setQuoteSent] = useState(quoteSentAt);
  const [invoiceSent, setInvoiceSent] = useState(invoiceSentAt);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const service = services.find((s) => s.id === serviceId) ?? null;

  // The estimate follows the service's rate times the hours, and can still be
  // typed over for a one off price.
  function recalc(nextServiceId: string, nextHours: string) {
    const svc = services.find((s) => s.id === nextServiceId) ?? null;
    const pence = estimatePricePence(svc, nextHours === "" ? null : Number(nextHours));
    setEstimate(toPounds(pence));
  }

  function values(): JobPricingInput {
    return {
      serviceRequiredId: serviceId || null,
      hoursRequired: hours === "" ? null : Number(hours),
      paymentFormat: format || null,
      estimatedPricePence: toPence(estimate),
      finalPricePence: toPence(finalPrice),
    };
  }

  function run(action: "save" | "quote" | "invoice") {
    setStatus(null);
    startTransition(async () => {
      const fn = action === "save" ? saveJobPricingAction : action === "quote" ? sendQuoteAction : generateInvoiceAction;
      const result = await fn(bookingId, values());
      if ("error" in result) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      if (action === "quote") setQuoteSent(new Date().toISOString());
      if (action === "invoice") setInvoiceSent(new Date().toISOString());
      setStatus({ kind: "ok", text: result.message ?? "Saved" });
    });
  }

  return (
    <div
      className={`grid gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-2 ${
        stacked ? "" : "lg:grid-cols-[1.4fr_0.7fr_1fr_1.4fr_1.4fr]"
      }`}
    >
      <label className={label}>
        Service required
        <select
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            recalc(e.target.value, hours);
          }}
          className={`mt-1 ${input}`}
        >
          <option value="">Choose…</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name.trim()}
              {s.hourly_rate_pence ? ` (${formatPence(s.hourly_rate_pence)}/hr)` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className={label}>
        Hours required
        <input
          type="number"
          min={0.25}
          max={100}
          step={0.25}
          inputMode="decimal"
          value={hours}
          onChange={(e) => {
            setHours(e.target.value);
            recalc(serviceId, e.target.value);
          }}
          className={`mt-1 ${input}`}
        />
      </label>

      <label className={label}>
        Payment format
        <select value={format} onChange={(e) => setFormat(e.target.value as PaymentFormat | "")} className={`mt-1 ${input}`}>
          <option value="">Choose…</option>
          <option value="set_price">Set price</option>
          <option value="hourly">Hourly</option>
        </select>
      </label>

      <div>
        <label htmlFor={`estimate-${bookingId}`} className={label}>
          Estimated price
        </label>
        <div className="mt-1 flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
            <input
              id={`estimate-${bookingId}`}
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              className={`${input} pl-5`}
            />
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("quote")}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-60"
          >
            {quoteSent ? "Resend quote" : "Generate quote"}
          </button>
        </div>
        {service?.hourly_rate_pence && hours ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {formatPence(service.hourly_rate_pence)} × {hours} hr
          </p>
        ) : null}
        {quoteSent && <p className="mt-1 text-xs text-success">Quote sent {formatDate(quoteSent)}</p>}
      </div>

      <div>
        <label htmlFor={`final-${bookingId}`} className={label}>
          Final price
        </label>
        <div className="mt-1 flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
            <input
              id={`final-${bookingId}`}
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={finalPrice}
              onChange={(e) => setFinalPrice(e.target.value)}
              className={`${input} pl-5`}
            />
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("invoice")}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-60"
          >
            {invoiceSent ? "Resend invoice" : "Generate invoice"}
          </button>
        </div>
        {!completed && !invoiceSent && <p className="mt-1 text-xs text-muted-foreground">Fill in once the job is complete.</p>}
        {invoiceSent && <p className="mt-1 text-xs text-success">Invoice sent {formatDate(invoiceSent)}</p>}
      </div>

      <div className={`flex flex-wrap items-center gap-3 sm:col-span-2 ${stacked ? "" : "lg:col-span-5"}`}>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("save")}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-brand disabled:opacity-60"
        >
          {pending ? "Working…" : "Save"}
        </button>
        {status && (
          <p role={status.kind === "error" ? "alert" : "status"} className={`text-xs ${status.kind === "error" ? "text-danger" : "text-success"}`}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}
