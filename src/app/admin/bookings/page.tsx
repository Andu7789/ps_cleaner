import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPence, formatTime } from "@/lib/format";
import { BookingStatusSelect } from "@/components/admin/booking-status-select";
import { SyncPaymentButton } from "@/components/admin/sync-payment-button";
import type { Booking, Cleaner, Customer, Service } from "@/lib/types";

type Row = Booking & { PS_CLEAN_services: Service; PS_CLEAN_cleaners: Cleaner; PS_CLEAN_customers: Customer };

interface ChangeLogRow {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  actor_name: string | null;
  changed_at: string;
  PS_CLEAN_bookings: { PS_CLEAN_services: { name: string } | null } | null;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function AdminBookingsPage() {
  const supabase = await createClient();
  const [{ data }, { data: changeLog }] = await Promise.all([
    supabase
      .from("PS_CLEAN_bookings")
      .select("*, PS_CLEAN_services(*), PS_CLEAN_cleaners(*), PS_CLEAN_customers(*)")
      .order("starts_at", { ascending: false })
      .limit(100),
    supabase
      .from("PS_CLEAN_admin_change_log")
      .select("id, field, old_value, new_value, actor_name, changed_at, PS_CLEAN_bookings(PS_CLEAN_services(name))")
      .order("changed_at", { ascending: false })
      .limit(20),
  ]);

  const bookings = (data ?? []) as Row[];
  const changes = (changeLog ?? []) as unknown as ChangeLogRow[];

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
              <tr key={b.id} className={`border-t border-border ${b.status === "pending_payment" ? "bg-danger/5" : ""}`}>
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
                  {b.status === "pending_payment" && <SyncPaymentButton bookingId={b.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bookings.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No bookings yet.</p>}
      </div>

      {changes.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">Recent changes</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            {changes.map((c) => (
              <li key={c.id}>
                <span className="text-foreground">{c.actor_name ?? "Someone"}</span> changed {c.field} on{" "}
                {c.PS_CLEAN_bookings?.PS_CLEAN_services?.name ?? "a booking"} from{" "}
                <span className="text-foreground">{c.old_value ?? "—"}</span> to{" "}
                <span className="text-foreground">{c.new_value ?? "—"}</span> · {formatRelative(c.changed_at)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
