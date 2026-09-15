import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Verifies the `token_hash` a magic-link email lands back with and
// establishes a real (cookie-backed) session, then redirects to wherever
// the customer was headed (`next`) — e.g. back to checkout after signing
// in mid-booking, see requestMagicLinkAction.
//
// This used to call exchangeCodeForSession(code) — the PKCE flow — but
// that silently never worked: requestMagicLinkAction emails a link built
// from admin.generateLink(), which (with no browser-side PKCE code
// challenge behind it) redirects back with the session in a URL
// *fragment* (#access_token=...), not a `?code=` query param, and a
// fragment never reaches the server at all. verifyOtp() with the raw
// token_hash sidesteps that distinction entirely — see requestMagicLinkAction
// for the full story.
//
// A dedicated route handler rather than middleware/proxy: Next.js 16 made
// Proxy run exclusively on the Node.js runtime with no opt-out, and
// Cloudflare Workers (this app's deployment target) only has experimental,
// currently-broken support for that via OpenNext — see DECISIONS.md. A
// route handler needs no such runtime and works everywhere.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = request.nextUrl.searchParams.get("next") || "/account";

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  return NextResponse.redirect(new URL(error ? "/login?error=auth" : next, request.url));
}
