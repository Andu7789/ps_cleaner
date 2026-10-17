import type { Business } from "@/lib/types";

// Where this business's card payments go, and what's left to do. Plain server
// markup: the only action is a link to the onboarding route.
export function PaymentsCard({ business, notice }: { business: Business; notice?: string }) {
  const connect = business.payment_mode === "connect";
  const ready = connect && business.stripe_charges_enabled;

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold text-foreground">Card payments</h2>
      {!connect && (
        <p className="mt-1 text-sm text-muted-foreground">
          Card payments are taken for you. Nothing to set up here.
        </p>
      )}
      {connect && ready && (
        <p className="mt-1 text-sm text-success">Connected. Payments from your customers are paid out to your own Stripe account.</p>
      )}
      {connect && !ready && (
        <>
          <p className="mt-1 text-sm text-foreground">
            One more step before customers can pay by card: tell Stripe where to send your money. It takes about five minutes.
          </p>
          <a
            href="/admin/payments/connect"
            className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
          >
            {business.stripe_connect_account_id ? "Continue setting up payouts" : "Set up payouts"}
          </a>
        </>
      )}
      {notice === "error" && (
        <p role="alert" className="mt-3 text-sm text-danger">Couldn&apos;t reach Stripe just now. Try again in a minute.</p>
      )}
    </section>
  );
}
