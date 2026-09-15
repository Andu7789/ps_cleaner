import { LoginForm } from "@/components/booking/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <LoginForm
        next={next}
        initialError={error ? "That sign-in link didn't work — it may have expired or already been used. Enter your email for a new one." : undefined}
      />
    </div>
  );
}
