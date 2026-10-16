import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness, getBusinessOrigin } from "@/lib/business";
import { formatDate, formatPence, formatServicePrice, formatTime, quoteUnconfirmed } from "@/lib/format";
import { signOutAction } from "@/lib/actions/customer";
import { CopyLinkButton } from "@/components/account/copy-link-button";
import { RecurringToggle } from "@/components/account/recurring-toggle";
import type { Booking, Cleaner, CustomerAddress, RecurringBooking, Service } from "@/lib/types";

type BookingRow = Booking & { PS_CLEAN_services: Service | null; PS_CLEAN_cleaners: Cleaner | null };
type RecurringRow = RecurringBooking & { PS_CLEAN_services: Service | null; PS_CLEAN_cleaners: Cleaner | null };

export default async function AccountPage() {
  const { user, customer } = await requireCustomer();
  const supabase = await createClient();
  const [{ data }, { data: creditBalance }, { data: recurringData }, { data: addressData }] = await Promise.all([
    supabase
      .from("PS_CLEAN_bookings")
      .select("*, PS_CLEAN_services(*), PS_CLEAN_cleaners(*)")
      .eq("customer_id", customer.id)
      .order("starts_at", { ascending: false }),
    supabase.rpc("ps_clean_customer_credit_balance", { p_customer_id: customer.id }),
    supabase
      .from("PS_CLEAN_recurring_bookings")
      .select("*, PS_CLEAN_services(*), PS_CLEAN_cleaners(*)")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("PS_CLEAN_customer_addresses")
      .select("*")
      .eq("customer_id", customer.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1),
  ]);
  const mainAddress = ((addressData ?? [])[0] as CustomerAddress | undefined) ?? null;

  const recurring = (recurringData ?? []) as RecurringRow[];

  const bookings = (data ?? []) as BookingRow[];
  const upcoming = bookings.filter((b) => b.status === "confirmed" || b.status === "pending_payment");
  const past = bookings.filter((b) => !upcoming.includes(b));
  const business = await getCurrentBusiness();
  const siteUrl = getBusinessOrigin(business);
  const referralLink = customer.referral_code ? `${siteUrl}/r/${customer.referral_code}` : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <section className="rounded-xl border border-border bg-card p-5">
        <h1 className="text-xl font-semibold text-foreground">Hi {customer.full_name || user.email}</h1>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-16 text-muted-foreground">Email</dt>
            <dd className="text-foreground">{customer.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 text-muted-foreground">Phone</dt>
            <dd className="text-foreground">{customer.phone || "Not added yet"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">Address</dt>
            <dd className="text-foreground">
              {mainAddress
                ? `${mainAddress.line1}, ${mainAddress.city} ${mainAddress.postcode}`
                : "No address saved yet"}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/account/details" className="rounded-lg border border-border px-3 py-1.5 font-medium text-brand hover:bg-muted">
            My details
          </Link>
          <Link href="/account/addresses" className="rounded-lg border border-border px-3 py-1.5 font-medium text-brand hover:bg-muted">
            Addresses
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="rounded-lg border border-border px-3 py-1.5 font-medium text-muted-foreground hover:bg-muted">
              Sign out
            </button>
          </form>
        </div>
      </section>

      {referralLink && (
        <section className="mt-6 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {(creditBalance ?? 0) > 0 ? `${formatPence(creditBalance ?? 0)} credit available` : "Refer a friend, earn credit"}
              </p>
              <p className="text-xs text-muted-foreground">
                Share your link — you both get £10 credit after their first clean.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="rounded-lg bg-muted px-2 py-1 text-xs text-foreground">{referralLink}</code>
              <CopyLinkButton link={referralLink} />
            </div>
          </div>
        </section>
      )}

      {recurring.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold text-foreground">Regular bookings</h2>
          <div className="mt-3 space-y-2">
            {recurring.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-sm">
                <div>
                  <p className="font-medium text-foreground">
                    {r.PS_CLEAN_services?.name} with {r.PS_CLEAN_cleaners?.full_name}
                  </p>
                  <p className="text-muted-foreground">
                    {r.frequency === "weekly" ? "Every week" : r.frequency === "fortnightly" ? "Every 2 weeks" : "Every month"} ·
                    {" "}
                    {r.is_active ? `Next: ${formatDate(r.next_occurrence_date)}` : "Paused"}
                  </p>
                </div>
                <RecurringToggle recurringId={r.id} isActive={r.is_active} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-semibold text-foreground">Upcoming bookings</h2>
        <div className="mt-3 space-y-3">
          {upcoming.map((b) => (
            <Link
              key={b.id}
              href={`/account/bookings/${b.id}`}
              className="block rounded-xl border border-border bg-card p-4 transition hover:border-brand"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{b.PS_CLEAN_services?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(b.starts_at)} at {formatTime(b.starts_at)} · {b.PS_CLEAN_cleaners?.full_name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">{quoteUnconfirmed(b) ? `Est. ${formatPence(b.price_pence)}` : formatServicePrice(b.price_pence)}</p>
                  <p
                    className={`text-xs capitalize ${
                      b.status === "pending_payment" ? "font-medium text-danger" : "text-muted-foreground"
                    }`}
                  >
                    {b.status === "pending_payment"
                      ? "Payment needed"
                      : quoteUnconfirmed(b)
                        ? "Quote to follow"
                        : b.status.replace("_", " ")}
                  </p>
                </div>
              </div>
            </Link>
          ))}
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No upcoming bookings.{" "}
              <Link href="/book" className="text-brand hover:underline">
                Book one now
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold text-foreground">Past bookings</h2>
          <div className="mt-3 space-y-3">
            {past.map((b) => (
              <div key={b.id} className="rounded-xl border border-border bg-card p-4 opacity-80">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{b.PS_CLEAN_services?.name}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(b.starts_at)}</p>
                  </div>
                  <p className="text-xs capitalize text-muted-foreground">{b.status.replace("_", " ")}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
