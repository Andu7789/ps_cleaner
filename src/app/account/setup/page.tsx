import { redirect } from "next/navigation";
import { getCustomer, requireUser } from "@/lib/auth";
import { createCustomerProfileAction } from "@/lib/actions/customer";

export default async function AccountSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const user = await requireUser();
  const existing = await getCustomer(user.id);
  if (existing) redirect(next || "/account");

  async function complete(formData: FormData) {
    "use server";
    const fullName = String(formData.get("fullName") ?? "");
    const phone = String(formData.get("phone") ?? "");
    await createCustomerProfileAction(fullName, phone, next);
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold text-foreground">Just a few details</h1>
      <p className="mt-1 text-sm text-muted-foreground">So your cleaner knows who to expect.</p>
      <form action={complete} className="mt-6 space-y-3">
        <input
          name="fullName"
          required
          placeholder="Full name"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          name="phone"
          required
          type="tel"
          placeholder="Phone number"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
