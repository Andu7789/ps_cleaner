import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";

// Every client running this app is a "business" (see PS_CLEAN_businesses,
// migration 0029). Resolved by hostname — custom_domain first, then a
// <slug>.psclean.site subdomain — so one deployment serves every client's
// own branded instance. DEFAULT_BUSINESS_SLUG is the fallback used for
// bare/unrecognized hosts (localhost in dev, the apex domain, a host that
// matches no business yet) — today that's also the only business that
// exists.
export const DEFAULT_BUSINESS_SLUG = "ps-clean";

// The Host header is attacker-controlled and gets interpolated into a
// PostgREST .or() filter string below, where commas and dots are the
// filter syntax itself — same risk Root Cafe's own tenant resolution
// guards against. Anything that isn't a plain DNS label is thrown away
// rather than reaching the query.
function safeSubdomain(label: string): string {
  return /^[a-z0-9-]{1,63}$/i.test(label) ? label : "";
}

export async function getCurrentBusiness(): Promise<Business> {
  const host = (await headers()).get("host") ?? "";
  const subdomain = safeSubdomain(host.split(".")[0] ?? "");
  const safeHost = /^[a-z0-9.-]{1,253}$/i.test(host) ? host : "";
  const supabase = await createClient();

  if (safeHost || subdomain) {
    const { data } = await supabase
      .from("PS_CLEAN_businesses")
      .select("*")
      .or(`slug.eq.${subdomain},custom_domain.eq.${safeHost}`)
      .maybeSingle();
    if (data) return data as Business;
  }

  const { data: fallback } = await supabase
    .from("PS_CLEAN_businesses")
    .select("*")
    .eq("slug", DEFAULT_BUSINESS_SLUG)
    .single();
  return fallback as Business;
}

// A business's own customer-facing origin — for links inside emails/SMS,
// which have no request/host of their own to resolve from the way a page
// render does.
export function getBusinessOrigin(business: Pick<Business, "slug" | "custom_domain">): string {
  if (process.env.NODE_ENV !== "production") return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `https://${business.custom_domain ?? `${business.slug}.psclean.site`}`;
}
