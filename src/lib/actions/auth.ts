"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// A failed/expired/already-used token has to bounce back to the *right*
// sign-in page, not just always the customer one — inferred from `next`'s
// path prefix rather than a separate param, since `next` already encodes
// which portal this attempt was for.
function loginPathFor(next: string): string {
  if (next.startsWith("/cleaner")) return "/cleaner/login";
  if (next.startsWith("/admin")) return "/admin/login";
  return "/login";
}

// Verifies the `token_hash` from a magic-link email and establishes a real
// (cookie-backed) session, then redirects to wherever the customer/cleaner/
// admin was headed.
//
// Deliberately behind a real button click (a POST from a <form>), not run
// automatically when /auth/callback's page loads. It used to fire on that
// bare GET — which meant any automatic link-prefetching (spam filters and
// some corporate mail gateways scan/open links in an email before the
// person ever sees it, to check they're safe) silently consumed the
// single-use token first. Found live: a cleaner's sign-in email landed in
// spam, Supabase's own auth log showed the token being verified
// successfully a couple of minutes before the cleaner's own click, which
// then failed with "one-time token not found" — the scanner's GET had
// already spent it. A form submission is a real user gesture a prefetcher
// won't perform, so this closes that off entirely rather than just telling
// people to check spam faster.
export async function confirmSignInAction(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = formData.get("type") as EmailOtpType | null;
  const next = String(formData.get("next") || "/account");
  const loginPath = loginPathFor(next);

  if (!tokenHash || !type) {
    redirect(`${loginPath}?error=auth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  redirect(error ? `${loginPath}?error=auth` : next);
}
