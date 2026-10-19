import Link from "next/link";
import { getCurrentBusiness } from "@/lib/business";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDate, formatTime, normaliseReference } from "@/lib/format";

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

// Customers have no account to look this up in later, so the reference is
// shown big and also emailed to them.
export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const reference = normaliseReference(ref ?? "");
  const business = await getCurrentBusiness();

  const { data } =
    reference.length === 8
      ? await createServiceClient()
          .from("PS_CLEAN_bookings")
          .select("reference, starts_at, PS_CLEAN_services(name), PS_CLEAN_cleaners(full_name)")
          .eq("business_id", business.id)
          .eq("reference", reference)
          .maybeSingle()
      : { data: null };
  const svc = one(data?.PS_CLEAN_services as { name: string } | { name: string }[] | null);
  const cleaner = one(data?.PS_CLEAN_cleaners as { full_name: string } | { full_name: string }[] | null);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success" aria-hidden="true">
        ✓
      </div>
      <h1 className="mt-4 text-xl font-semibold text-foreground">Booking confirmed</h1>
      {data ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {svc?.name ?? "Your clean"} with {cleaner?.full_name ?? "your cleaner"} on {formatDate(data.starts_at)} at{" "}
            {formatTime(data.starts_at)}.
          </p>
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Your booking reference</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] text-foreground">{data.reference}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              We&apos;ve emailed this to you. Use it with <span className="font-medium text-foreground">Amend existing booking</span>{" "}
              to change your date or time.
            </p>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Your booking is in. Check your email for your booking reference.</p>
      )}
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-brand hover:underline">
        Back to the homepage
      </Link>
    </div>
  );
}
