import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { ServiceList } from "@/components/service-list";
import type { Service } from "@/lib/types";

export default async function HomePage() {
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
    <div className="mx-auto max-w-5xl px-4 py-12">
      <section className="rounded-2xl bg-brand px-6 py-14 text-center text-brand-foreground sm:px-12">
        {business.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- per-business logo, arbitrary external URL
          <img src={business.logo_url} alt="" className="mx-auto mb-5 h-24 w-auto max-w-64 rounded-xl bg-white object-contain p-2" />
        )}
        <h1 className="text-3xl font-semibold sm:text-4xl">Book a trusted clean in minutes</h1>
        <p className="mx-auto mt-3 max-w-xl text-brand-foreground/90">
          {business.business_name} — pick a service, choose a time that suits you, and pay securely online.
        </p>
        <Link
          href="/book"
          className="mt-6 inline-block rounded-lg bg-white px-6 py-3 font-semibold text-brand hover:bg-white/90"
        >
          Book now
        </Link>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-foreground">Our services</h2>
        <div className="mt-4">
          <ServiceList services={services} />
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground">Services will appear here once they&apos;re set up.</p>
          )}
        </div>
      </section>
    </div>
  );
}
