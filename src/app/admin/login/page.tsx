import { LoginForm } from "@/components/booking/login-form";

export default function AdminLoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Admin sign in
      </p>
      <LoginForm next="/admin" />
    </div>
  );
}
