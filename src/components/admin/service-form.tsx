"use client";

import { useState, useTransition } from "react";
import { createServiceAction, updateServiceAction } from "@/lib/actions/admin";
import { FEATURED_DEFAULT_MESSAGE, formatPence, hourlyPricePence } from "@/lib/format";
import type { Service } from "@/lib/types";

// Explicit text and background colours: inputs inherit colour from the muted label around them, which made typed values look disabled.
const inputClass =
  "mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70";

// One form for adding a service and editing an existing one.
export function ServiceForm({ service, onDone }: { service?: Service; onDone?: () => void }) {
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [price, setPrice] = useState(service ? (service.price_pence / 100).toString() : "");
  const [totalMinutes, setTotalMinutes] = useState(String(service?.duration_minutes ?? 60));
  const [customerMinutes, setCustomerMinutes] = useState(
    service?.customer_duration_minutes ? String(service.customer_duration_minutes) : ""
  );
  const [bufferBefore, setBufferBefore] = useState(String(service?.buffer_before_minutes ?? 0));
  const [bufferAfter, setBufferAfter] = useState(String(service?.buffer_after_minutes ?? 15));
  const [requiresQuote, setRequiresQuote] = useState(service?.requires_quote ?? false);
  const [hourly, setHourly] = useState(service?.hourly_rate_pence != null);
  const [hourlyRate, setHourlyRate] = useState(
    service?.hourly_rate_pence != null ? (service.hourly_rate_pence / 100).toString() : ""
  );
  const [priceIsFrom, setPriceIsFrom] = useState(service?.price_is_from ?? false);
  const [isFeatured, setIsFeatured] = useState(service?.is_featured ?? false);
  const [featuredMessage, setFeaturedMessage] = useState(service?.featured_message ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // The price follows the time customers are told the clean takes.
  const cleanMinutes = Number(customerMinutes || totalMinutes) || 0;
  const cleanPricePence = hourlyPricePence(Math.round(Number(hourlyRate || 0) * 100), cleanMinutes);
  const cleanHoursLabel = `${Math.round((cleanMinutes / 60) * 100) / 100} hr`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const input = {
      name,
      description: description || undefined,
      durationMinutes: Number(totalMinutes),
      customerDurationMinutes: customerMinutes ? Number(customerMinutes) : null,
      bufferBeforeMinutes: Number(bufferBefore),
      bufferAfterMinutes: Number(bufferAfter),
      pricePence: Math.round(Number(price || 0) * 100),
      priceIsFrom,
      hourlyRatePence: hourly ? Math.round(Number(hourlyRate || 0) * 100) : null,
      requiresQuote,
      isFeatured,
      featuredMessage: isFeatured ? featuredMessage : null,
    };
    startTransition(async () => {
      try {
        if (service) {
          await updateServiceAction(service.id, input);
          setSaved(true);
          onDone?.();
        } else {
          await createServiceAction(input);
          setName("");
          setDescription("");
          setPrice("");
          setCustomerMinutes("");
          setRequiresQuote(false);
          setPriceIsFrom(false);
          setHourly(false);
          setHourlyRate("");
          setIsFeatured(false);
          setFeaturedMessage("");
          setSaved(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the service");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Standard Clean)"
        aria-label="Service name"
        className={inputClass}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        aria-label="Description"
        className={inputClass}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {hourly ? (
          <label className="text-xs text-muted-foreground">
            Hourly rate (£ per hour)
            <input type="number" required min={0} step={0.01} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className={inputClass} />
            <span className="mt-1 block">
              Price for this clean: <strong className="text-foreground">{formatPence(cleanPricePence)}</strong> ({cleanHoursLabel} at
              the hourly rate)
            </span>
          </label>
        ) : (
          <label className="text-xs text-muted-foreground">
            Price (£). Enter 0 to show it to customers as Free
            <input type="number" required min={0} step={0.01} value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
          </label>
        )}
        <label className="text-xs text-muted-foreground">
          Total time in the diary (minutes)
          <input type="number" required min={5} step={5} value={totalMinutes} onChange={(e) => setTotalMinutes(e.target.value)} className={inputClass} />
        </label>
        <label className="text-xs text-muted-foreground">
          Time shown to customers (minutes, optional)
          <input type="number" min={5} step={5} value={customerMinutes} onChange={(e) => setCustomerMinutes(e.target.value)} placeholder="Same as total" className={inputClass} />
        </label>
        <label className="text-xs text-muted-foreground">
          Buffer before (minutes)
          <input type="number" min={0} step={5} value={bufferBefore} onChange={(e) => setBufferBefore(e.target.value)} className={inputClass} />
        </label>
        <label className="text-xs text-muted-foreground">
          Buffer after, travel time (minutes)
          <input type="number" min={0} step={5} value={bufferAfter} onChange={(e) => setBufferAfter(e.target.value)} className={inputClass} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        The total time is what gets blocked in the diary, so include travel or set up. Customers only see the time shown
        to them, for example a walkthrough that takes 20 minutes with the customer but blocks 45.
      </p>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" className="mt-1 accent-brand" checked={hourly} onChange={(e) => setHourly(e.target.checked)} />
        <span>
          Charge by the hour
          <span className="block text-xs text-muted-foreground">
            Enter an hourly rate instead of a fixed price. The price is worked out from the time shown to customers, so a
            1 hour 30 minute clean at £20 an hour costs £30. Untick it to use a fixed price.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" className="mt-1 accent-brand" checked={priceIsFrom} onChange={(e) => setPriceIsFrom(e.target.checked)} />
        <span>
          Pricing starts from
          <span className="block text-xs text-muted-foreground">
            Customers see this as &quot;From £X&quot;, for example &quot;From £60.00&quot;, so they know the price can go up
            depending on the job. Use it with &quot;We will check the quote&quot; below if you confirm the exact price yourself.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" className="mt-1 accent-brand" checked={requiresQuote} onChange={(e) => setRequiresQuote(e.target.checked)} />
        <span>
          We will check the quote and provide a price
          <span className="block text-xs text-muted-foreground">
            Customers are told you will be in contact with an exact price and pay nothing when they book. You confirm the
            price, then the cleaner and customer are told. The customer pays once the price is confirmed.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" className="mt-1 accent-brand" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
        <span>
          Make this the stand out button
          <span className="block text-xs text-muted-foreground">
            Shows this service as a wide button across both columns above the other services. Only one service should
            be ticked at a time.
          </span>
        </span>
      </label>
      {isFeatured && (
        <label className="block text-xs text-muted-foreground">
          Stand out message
          <input
            value={featuredMessage}
            onChange={(e) => setFeaturedMessage(e.target.value)}
            placeholder={FEATURED_DEFAULT_MESSAGE}
            maxLength={80}
            className={inputClass}
          />
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-success">Saved.</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60">
        {pending ? "Saving…" : service ? "Save changes" : "Add service"}
      </button>
    </form>
  );
}
