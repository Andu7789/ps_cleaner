export function formatPence(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

// Price for a clean charged by the hour: the rate over the time the customer is
// told it takes, rounded to the nearest penny.
export function hourlyPricePence(hourlyRatePence: number, cleanMinutes: number): number {
  return Math.round((hourlyRatePence * cleanMinutes) / 60);
}

// Shown on the stand out service button when the owner hasn't written their own.
export const WALKTHROUGH_FIRST_NOTE = "Simply book a walkthrough then receive your quote!";
export const WALKTHROUGH_FIRST_CTA = "Book your walkthrough";

// The service customers are sent to for a "walkthrough first" job: the stand
// out service if there is one, otherwise any bookable service with walkthrough
// in its name. Null when the owner hasn't set one up.
export function findWalkthroughService<T extends { id: string; name: string; is_featured: boolean; walkthrough_first: boolean }>(
  services: T[]
): T | null {
  const bookable = services.filter((s) => !s.walkthrough_first);
  return bookable.find((s) => s.is_featured) ?? bookable.find((s) => /walk\s?-?through/i.test(s.name)) ?? null;
}

export const FEATURED_DEFAULT_MESSAGE = "New here? Book a free walkthrough";

// Customer-facing price: a £0 service reads as "Free" rather than "£0.00".
export function formatServicePrice(pence: number): string {
  return pence <= 0 ? "Free" : formatPence(pence);
}

// The time customers are told a job takes. duration_minutes is the total
// blocked in the diary, which can be longer (travel, set up).
// Price as shown on a service card: free, a plain price, or "from" for a
// service whose final price is quoted after the cleaner has seen the job.
export function servicePriceLabel(service: {
  price_pence: number;
  requires_quote: boolean;
  price_is_from?: boolean;
  walkthrough_first?: boolean;
  hourly_rate_pence?: number | null;
}): string {
  // A service charged by the hour is described by its rate, not the total for one clean.
  if (service.hourly_rate_pence != null && service.hourly_rate_pence > 0) {
    const rate = `${formatPence(service.hourly_rate_pence)} per hour`;
    return service.requires_quote || service.price_is_from || service.walkthrough_first ? `From ${rate}` : rate;
  }
  if (service.requires_quote) return service.price_pence > 0 ? `From ${formatPence(service.price_pence)}` : "Quote on request";
  if ((service.price_is_from || service.walkthrough_first) && service.price_pence > 0) return `From ${formatPence(service.price_pence)}`;
  return formatServicePrice(service.price_pence);
}

// True while a quote booking's price is still only an estimate.
export function quoteUnconfirmed(b: { quote_status: string | null }): boolean {
  return b.quote_status === "pending";
}

// What a customer still owes once their quote is confirmed: the whole price,
// less anything already paid. Zero until the quote is confirmed.
export function quoteAmountDue(b: {
  quote_status: string | null;
  price_pence: number;
  amount_paid_pence: number;
}): number {
  if (b.quote_status !== "quoted") return 0;
  return Math.max(0, b.price_pence - b.amount_paid_pence);
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

// Booking references are 8 characters (see migration 0051). Customers may
// type them with spaces, dashes or in lower case.
export function normaliseReference(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Estimated price for a job: the clean's hourly rate times the hours needed,
// or its fixed price when it has no hourly rate. Null until both are known.
export function estimatePricePence(
  service: { hourly_rate_pence: number | null; price_pence: number } | null | undefined,
  hours: number | null | undefined
): number | null {
  if (!service) return null;
  if (service.hourly_rate_pence && service.hourly_rate_pence > 0) {
    if (!hours || hours <= 0) return null;
    return Math.round(service.hourly_rate_pence * hours);
  }
  return service.price_pence;
}

export function accessMethodLabel(method: string, who: "customer" | "you"): string {
  if (method === "keys") return "Customer will provide keys";
  if (method === "key_box") return "Customer has a key box";
  return who === "you" ? "Customer will let you in" : "Customer will let the cleaner in";
}
