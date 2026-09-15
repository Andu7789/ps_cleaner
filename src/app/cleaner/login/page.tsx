import { LoginForm } from "@/components/booking/login-form";

export default async function CleanerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage =
    error === "not_a_cleaner"
      ? "That email isn't linked to an active cleaner account — ask the office to check your details."
      : error
        ? "That sign-in link didn't work — it may have expired or already been used. Enter your email for a new one."
        : undefined;
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Cleaner sign in
      </p>
      <LoginForm next="/cleaner" initialError={errorMessage} />
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Only registered cleaners can sign in here — ask the office if you don&apos;t have access yet.
      </p>
    </div>
  );
}
