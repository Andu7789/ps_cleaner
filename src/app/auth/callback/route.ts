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
// A failed/expired/already-used token has to bounce back to the *right*
// sign-in page, not just always the customer one — found live when a
// cleaner's magic link failed silently, dumped them on the generic
// customer /login, and they (reasonably) typed their own email into the
// form in front of them, ending up signed in as themselves via the
// customer flow instead of as the cleaner they meant to test. Inferred
// from `next`'s path prefix rather than a separate param, since `next`
// already encodes which portal this attempt was for.
function loginPathFor(next: string): string {
  if (next.startsWith("/cleaner")) return "/cleaner/login";
  if (next.startsWith("/admin")) return "/admin/login";
  return "/login";
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = request.nextUrl.searchParams.get("next") || "/account";
  const loginPath = loginPathFor(next);

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL(`${loginPath}?error=auth`, request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  return NextResponse.redirect(new URL(error ? `${loginPath}?error=auth` : next, request.url));
}
