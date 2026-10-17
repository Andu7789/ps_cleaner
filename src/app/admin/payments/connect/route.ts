import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getBusinessOrigin, getCurrentBusiness } from "@/lib/business";
import { createOnboardingLink, ensureConnectAccount } from "@/lib/stripe-connect";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Sends the owner to Stripe to set up where their money is paid out. Stripe's
// links expire within minutes, so this makes a fresh one on every visit,
// which is also what Stripe's own "refresh" redirect comes back to.
export async function GET() {
  await requireOwner();
  const business = await getCurrentBusiness();
  const origin = getBusinessOrigin(business);

  if (business.payment_mode !== "connect") {
    return NextResponse.redirect(`${origin}/admin/settings`);
  }
  try {
    const accountId = await ensureConnectAccount(createServiceClient(), business);
    return NextResponse.redirect(await createOnboardingLink(accountId, origin));
  } catch (err) {
    console.error("Stripe onboarding link failed", err);
    return NextResponse.redirect(`${origin}/admin/settings?payments=error`);
  }
}
