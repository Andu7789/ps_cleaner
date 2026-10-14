export function formatPence(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

// Customer-facing price: a £0 service reads as "Free" rather than "£0.00".
export function formatServicePrice(pence: number): string {
  return pence <= 0 ? "Free" : formatPence(pence);
}

// The time customers are told a job takes. duration_minutes is the total
// blocked in the diary, which can be longer (travel, set up).
// Price as shown on a service card: free, a plain price, or "from" for a
// service whose final price is quoted after the cleaner has seen the job.
export function servicePriceLabel(service: { price_pence: number; requires_quote: boolean }): string {
  if (service.requires_quote) return service.price_pence > 0 ? `From ${formatPence(service.price_pence)}` : "Quote on request";
  return formatServicePrice(service.price_pence);
}

// True while a quote booking's price is still only an estimate.
export function quoteUnconfirmed(b: { quote_status: string | null }): boolean {
  return b.quote_status === "pending";
}

export function customerMinutes(service: { duration_minutes: number; customer_duration_minutes: number | null }): number {
  return service.customer_duration_minutes ?? service.duration_minutes;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}
