import type { Metadata } from "next";
import { AmendBooking } from "@/components/booking/amend-booking";

export const metadata: Metadata = { title: "Amend existing booking" };

export default function AmendPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Amend existing booking</h1>
      <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
        Enter the booking reference from your confirmation email to pick a new date and time.
      </p>
      <div className="mt-8">
        <AmendBooking />
      </div>
    </div>
  );
}
