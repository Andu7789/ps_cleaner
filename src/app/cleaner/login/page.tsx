import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { cleanerSignInAction, requestCleanerPasswordSetupAction } from "@/lib/actions/cleaner-auth";

export default async function CleanerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage =
    error === "not_a_cleaner"
      ? "That email isn't linked to an active cleaner account. Ask the office to check your details."
      : error
        ? 'That link didn\'t work, it may have expired or already been used. Use "Forgot password" for a new one.'
        : undefined;
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Cleaner sign in
      </p>
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
