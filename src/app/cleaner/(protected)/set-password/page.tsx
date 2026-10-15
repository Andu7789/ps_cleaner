import { SetPasswordForm } from "@/components/auth/set-password-form";
import { setCleanerPasswordAction } from "@/lib/actions/cleaner-auth";

export default function CleanerSetPasswordPage() {
  return (
    <div className="py-6">
      <h1 className="text-xl font-semibold text-foreground">Set your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You&apos;ll use this with your email to sign in from now on.
      </p>
      <SetPasswordForm action={setCleanerPasswordAction} />
    </div>
  );
}
