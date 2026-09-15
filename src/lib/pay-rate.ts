import type { PayRateType } from "@/lib/types";

// Shared between invoice generation (lib/actions/invoices.ts) and the
// cleaner's own earnings summary — both need the exact same "what does
// this job pay this cleaner" math, and it can't live in invoices.ts
// itself since "use server" files may only export async server actions,
// not a plain helper function.
export function computePayable(
  booking: { price_pence: number; starts_at: string; ends_at: string },
  payRateType: PayRateType,
  payRateValue: number
): number {
  if (payRateType === "percentage") return Math.round((booking.price_pence * payRateValue) / 100);
  if (payRateType === "hourly") {
    const hours = (new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 3_600_000;
    return Math.round(hours * payRateValue);
  }
  return Math.round(payRateValue);
}
