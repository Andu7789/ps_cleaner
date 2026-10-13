import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { CustomerDetailsForm } from "@/components/account/customer-details-form";

export default async function AccountDetailsPage() {
  const { user, customer } = await requireCustomer();

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <Link href="/account" className="text-sm text-brand hover:underline">
        Back to my account
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-foreground">My details</h1>
      <p className="mt-1 text-sm text-muted-foreground">So your cleaner knows who to expect.</p>
      <CustomerDetailsForm
        initialFullName={customer.full_name ?? ""}
        initialPhone={customer.phone ?? ""}
        email={customer.email ?? user.email ?? ""}
      />
    </div>
  );
}
