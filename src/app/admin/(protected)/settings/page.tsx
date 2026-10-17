import { getCurrentBusiness } from "@/lib/business";
import { isOwner } from "@/lib/auth";
import { SettingsPanel } from "@/components/admin/settings-panel";
import { PaymentsCard } from "@/components/admin/payments-card";
import { syncConnectStatus } from "@/lib/stripe-connect";
import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ payments?: string }>;
}) {
  const { payments } = await searchParams;
  let settings = await getCurrentBusiness();
  const owner = await isOwner();

  // Coming back from Stripe, the webhook may not have landed yet, so ask
  // Stripe directly rather than showing a stale "not finished" message.
  if (owner && settings.payment_mode === "connect" && !settings.stripe_charges_enabled && settings.stripe_connect_account_id) {
    try {
      const ready = await syncConnectStatus(createServiceClient(), settings.id, settings.stripe_connect_account_id);
      settings = { ...settings, stripe_charges_enabled: ready };
    } catch (err) {
      console.error("Couldn't refresh Stripe status", err);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Business details shown on the public site, and the timing of automatic reminders and balance charges.
      </p>
      {owner && <PaymentsCard business={settings} notice={payments} />}
      <SettingsPanel settings={settings} />
    </div>
  );
}
