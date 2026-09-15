import { NextResponse, type NextRequest } from "next/server";

// A referral link (e.g. shared as https://.../r/ABC123) — sets a cookie
// remembering who referred this visitor and sends them on to browse
// services. Read back (and cleared) in createCustomerProfileAction when
// they actually sign up. A dedicated redirect route rather than a query
// param carried through every page, since a visitor might land on the
// referral link, browse around for a while, and sign up several clicks
// later — a cookie survives that, a URL param wouldn't without
// middleware threading it through every navigation.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const response = NextResponse.redirect(new URL("/book", request.url));
  response.cookies.set("ps_clean_ref", code, {
    maxAge: 60 * 60 * 24 * 30, // 30 days — long enough to cover a slow decision, not forever
    httpOnly: true,
    sameSite: "lax",
  });
  return response;
}
