import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { getUser } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/customer";
import { cleanerSignInAction, requestCleanerPasswordSetupAction } from "@/lib/actions/cleaner-auth";

export default async function CleanerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getUser();
  const errorMessage =
    error === "not_a_cleaner"
      ? "That email isn't linked to an active cleaner account. Ask the office to check your details."
      : error
        ? 'That link didn\'t work, it may have expired or already been used. Use "Forgot password" for a new one.'
        : undefined;
  return (
    <div className="neutral-page mx-auto max-w-sm px-4 py-16">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Cleaner sign in
      </p>
      {user && error === "not_a_cleaner" && (
        <div className="mb-5 rounded-lg border border-border bg-card p-3 text-sm text-foreground">
          <p>
            You&apos;re currently signed in as <strong>{user.email}</strong>, which isn&apos;t a cleaner account. Sign out,
            then sign in with your cleaner email.
          </p>
          <form action={signOutAction} className="mt-2">
            <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground">
              Sign out
            </button>
          </form>
        </div>
      )}
      <PasswordLoginForm
        signIn={cleanerSignInAction}
        requestSetup={requestCleanerPasswordSetupAction}
        setupWho="a cleaner"
        initialError={errorMessage}
      />
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Only registered cleaners can sign in here. Ask the office if you don&apos;t have access yet.
      </p>
    </div>
  );
}
