import { LoginForm } from "@/components/booking/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <LoginForm next={next} />
    </div>
  );
}
