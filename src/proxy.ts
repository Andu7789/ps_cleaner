import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the middleware convention file/export from
// middleware.ts/`middleware` to proxy.ts/`proxy` — a root-level middleware.ts
// is silently never registered at all under 16 (confirmed by testing: the
// x-pathname header never arrived, and Supabase's code-exchange redirect
// never ran). Named/placed to match Root Cafe's own already-working setup
// for this Next.js version.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
