import { redirect } from "next/navigation";
import { confirmSignInAction } from "@/lib/actions/auth";

function loginPathFor(next: string): string {
  if (next.startsWith("/cleaner")) return "/cleaner/login";
  if (next.startsWith("/admin")) return "/admin/login";
  return "/login";
}

// Landing page for a magic-link email — deliberately requires a real click
// (confirmSignInAction, a form POST) rather than verifying the token the
// instant this page loads. See confirmSignInAction for why: an automatic
// GET here is exactly what a spam filter's link-prefetching does, and that
// silently burns the single-use token before the person ever sees it.
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;
  const nextPath = next || "/account";

  if (!token_hash || !type) {
    redirect(`${loginPathFor(nextPath)}?error=auth`);
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sign in</p>
      <h1 className="mt-2 text-xl font-semibold text-foreground">Confirm it&apos;s you</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        One more step — confirm below to finish signing in.
      </p>
      <form action={confirmSignInAction} className="mt-6">
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={nextPath} />
        <button
          type="submit"
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground"
        >
          Confirm sign-in
        </button>
      </form>
    </div>
  );
}
