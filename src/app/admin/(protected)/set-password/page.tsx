import { SetPasswordForm } from "@/components/auth/set-password-form";
import { setAdminPasswordAction } from "@/lib/actions/admin-auth";

export default function SetPasswordPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold text-foreground">Set your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You&apos;ll use this with your email to sign in to the admin portal.
      </p>
      <SetPasswordForm action={setAdminPasswordAction} />
    </div>
  );
}
