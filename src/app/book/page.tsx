import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { formatDuration, formatPence } from "@/lib/format";
import type { Service } from "@/lib/types";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;
  if (service) redirect(`/book/${service}`);

  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_services")
    .select("*")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("price_pence", { ascending: true });
  const services = (data ?? []) as Service[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold text-foreground">Choose a service</h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {services.map((s) => (
          <Link
            key={s.id}
            href={`/book/${s.id}`}
            className="rounded-xl border border-border bg-card p-5 transition hover:border-brand"
          >
            <h3 className="font-semibold text-foreground">{s.name}</h3>
            {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{formatDuration(s.duration_minutes)}</span>
              <span className="font-semibold text-brand">{formatPence(s.price_pence)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
