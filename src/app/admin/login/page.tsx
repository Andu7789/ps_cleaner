import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { adminSignInAction, requestAdminPasswordSetupAction } from "@/lib/actions/admin-auth";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage =
    error === "not_an_admin"
      ? "That email isn't linked to an admin account — ask an existing admin to invite you."
      : error
        ? "That link didn't work, it may have expired or already been used. Use \"Forgot password\" for a new one."
        : undefined;
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Admin sign in
      </p>
      <PasswordLoginForm
        signIn={adminSignInAction}
        requestSetup={requestAdminPasswordSetupAction}
        setupWho="an admin"
        initialError={errorMessage}
      />
    </div>
  );
}
