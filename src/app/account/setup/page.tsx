import { redirect } from "next/navigation";
import { getCustomer, requireUser } from "@/lib/auth";
import { AccountSetupForm } from "@/components/account-setup-form";

export default async function AccountSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const user = await requireUser();
  const existing = await getCustomer(user.id);
  if (existing) redirect(next || "/account");

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold text-foreground">Just a few details</h1>
      <p className="mt-1 text-sm text-muted-foreground">So your cleaner knows who to expect.</p>
      <AccountSetupForm next={next} />
    </div>
  );
}
