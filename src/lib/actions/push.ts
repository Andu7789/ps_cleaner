"use server";

import { requireCleaner } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Remembers this device so the cleaner can be told about new bookings.
export async function savePushSubscriptionAction(input: SubscriptionInput): Promise<{ error: string } | undefined> {
  const { cleaner } = await requireCleaner();
  if (!input.endpoint || !input.p256dh || !input.auth) return { error: "Couldn't read this device's notification details." };
  const service = createServiceClient();
  const { error } = await service.from("PS_CLEAN_push_subscriptions").upsert(
    {
      business_id: cleaner.business_id,
      cleaner_id: cleaner.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) return { error: error.message };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<{ error: string } | undefined> {
  const { cleaner } = await requireCleaner();
  const service = createServiceClient();
  const { error } = await service
    .from("PS_CLEAN_push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("cleaner_id", cleaner.id);
  if (error) return { error: error.message };
}
