import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the PKCE `code` a magic-link email lands back with for a real
// session, then redirects to wherever the customer was headed (`next`) —
// e.g. back to checkout after signing in mid-booking, see
// requestMagicLinkAction. A dedicated route handler rather than
// middleware/proxy: Next.js 16 made Proxy run exclusively on the Node.js
// runtime with no opt-out, and Cloudflare Workers (this app's deployment
// target) only has experimental, currently-broken support for that via
// OpenNext — see DECISIONS.md for the full story. A route handler needs no
// such runtime and works everywhere.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") || "/account";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  return NextResponse.redirect(new URL(error ? "/login?error=auth" : next, request.url));
}
