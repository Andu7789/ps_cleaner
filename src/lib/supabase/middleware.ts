import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Forwarded so Server Components (the admin layout) can tell the admin
  // login route apart from every other admin route without a route-tree
  // restructure — headers() has no other way to see the current pathname
  // server-side.
  request.headers.set("x-pathname", request.nextUrl.pathname);
  let supabaseResponse = NextResponse.next({ request });

  // Background route prefetches don't need a fresh auth check, and firing
  // several at once races Supabase's single-use refresh token, silently
  // invalidating the session on the losers.
  if (request.headers.get("next-router-prefetch") && !request.nextUrl.searchParams.get("code")) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const next = request.nextUrl.searchParams.get("next") || "/account";
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const redirectUrl = new URL(error ? "/login?error=auth" : next, request.url);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  // IMPORTANT: do not run code between createServerClient and auth.getUser().
  await supabase.auth.getUser();

  return supabaseResponse;
}
