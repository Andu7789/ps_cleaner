import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPence, formatTime } from "@/lib/format";
import { BookingStatusSelect } from "@/components/admin/booking-status-select";
import type { Booking, Cleaner, Customer, Service } from "@/lib/types";

type Row = Booking & { PS_CLEAN_services: Service; PS_CLEAN_cleaners: Cleaner; PS_CLEAN_customers: Customer };

export default async function AdminBookingsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_bookings")
    .select("*, PS_CLEAN_services(*), PS_CLEAN_cleaners(*), PS_CLEAN_customers(*)")
    .order("starts_at", { ascending: false })
    .limit(100);

  const bookings = (data ?? []) as Row[];

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Bookings</h1>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-2">When</th>
              <th className="pb-2">Customer</th>
              <th className="pb-2">Service</th>
              <th className="pb-2">Cleaner</th>
              <th className="pb-2">Paid</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="py-2">
                  {formatDate(b.starts_at)}
                  <br />
                  {formatTime(b.starts_at)}
                </td>
                <td className="py-2">{b.PS_CLEAN_customers?.full_name ?? "—"}</td>
                <td className="py-2">{b.PS_CLEAN_services?.name}</td>
                <td className="py-2">{b.PS_CLEAN_cleaners?.full_name}</td>
                <td className="py-2">{formatPence(b.amount_paid_pence)}</td>
                <td className="py-2">
                  <BookingStatusSelect bookingId={b.id} status={b.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bookings.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No bookings yet.</p>}
      </div>
    </div>
  );
}
