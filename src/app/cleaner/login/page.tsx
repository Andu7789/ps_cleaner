import { LoginForm } from "@/components/booking/login-form";

export default function CleanerLoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Cleaner sign in
      </p>
      <LoginForm next="/cleaner" />
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Only registered cleaners can sign in here — ask the office if you don&apos;t have access yet.
      </p>
    </div>
  );
}
