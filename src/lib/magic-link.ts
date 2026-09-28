import { getBusinessOrigin } from "@/lib/business";
import { createServiceClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";

// Deliberately NOT supabase.auth.signInWithOtp(), which sends Supabase's
// own built-in "Magic Link" email, whose template is a project wide Auth
// setting in this shared Supabase project that Root Café's app has
// already branded for itself. generateLink() (service role only) creates
// the token without sending anything, so PS Cleaning can email it with
// its own branding instead. See DECISIONS.md #9.
//
// Deliberately NOT data.properties.action_link either. That points at
// Supabase's own /auth/v1/verify endpoint, which (with no PKCE code
// challenge behind it, since this is an admin generated link with no
// browser involved yet) redirects back with the session in a URL
// *fragment* (#access_token=...), not a `?code=` query param. A fragment
// never reaches the server at all, so this silently broke every magic
// link sign in end to end. Building our own link with the raw token_hash
// and verifying it ourselves via verifyOtp() in /auth/callback sidesteps
// the whole implicit vs PKCE question, and is Supabase's own documented
// pattern for a self sent auth email.
//
// Lives outside any "use server" file so it can't be called directly from
// the browser, which would let anyone mint a sign in link for any email.
export async function generateMagicLink(
  business: Pick<Business, "slug" | "custom_domain">,
  email: string,
  next: string
): Promise<string> {
  const service = createServiceClient();
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);

  const hashedToken = data.properties?.hashed_token;
  if (!hashedToken) throw new Error("Couldn't generate a sign-in link");

  return `${getBusinessOrigin(business)}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&next=${encodeURIComponent(next)}`;
}
