import { NextResponse, type NextRequest } from "next/server";

// Old referral links (e.g. https://.../r/ABC123). Referrals needed customer
// accounts, which have gone, so these just send visitors to the homepage.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}
