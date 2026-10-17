import Link from "next/link";
import { notFound } from "next/navigation";
import { DangerZone } from "@/components/platform/danger-zone";
import { OwnerLinkCard, SetupPanel } from "@/components/platform/request-actions";
import { DEFAULT_BUSINESS_SLUG } from "@/lib/business";
import { formatPence } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";
import { loadRequestById, ownerLink, platformOrigin } from "@/lib/onboarding-server";
import { DAY_NAMES, DAY_ORDER, STATUS_LABEL, completeness, poundsToPence } from "@/lib/onboarding";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children ?? <span className="text-muted-foreground">Not answered</span>}</dd>
    </div>
  );
}

export default async function PlatformRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await loadRequestById(id);
  if (!req) notFound();

  const db = createServiceClient();
  const [{ data: businessRow }, bookings, customers, payments] = req.business_id
    ? await Promise.all([
        db.from("PS_CLEAN_businesses").select("slug").eq("id", req.business_id).maybeSingle(),
        db.from("PS_CLEAN_bookings").select("id", { count: "exact", head: true }).eq("business_id", req.business_id),
        db.from("PS_CLEAN_customers").select("id", { count: "exact", head: true }).eq("business_id", req.business_id),
        db.from("PS_CLEAN_payments").select("id", { count: "exact", head: true }).eq("business_id", req.business_id),
      ])
    : [{ data: null }, null, null, null];
  const { data: live } = req.business_id
    ? await createServiceClient()
        .from("PS_CLEAN_businesses")
        .select("payment_mode, stripe_charges_enabled")
        .eq("id", req.business_id)
        .maybeSingle()
    : { data: null };
  const a = req.answers;
  const progress = completeness(a);
  const origin = await platformOrigin();
  const address = a.address?.customDomain || (a.address?.slug ? `${a.address.slug}.psclean.site` : null);
  const days = DAY_ORDER.flatMap((d) => {
    const hours = a.hours?.days?.find((x) => x?.day === d);
    return hours?.on ? [{ day: d, start: hours.start ?? "09:00", end: hours.end ?? "17:00" }] : [];
  });

  return (
    <div className="space-y-5">
      <div>
        <Link href="/platform" className="text-sm text-muted-foreground underline">All businesses</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">{req.business_name || "Unnamed business"}</h1>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">{STATUS_LABEL[req.status]}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {req.owner_name || "No name yet"}{req.owner_email ? `, ${req.owner_email}` : ""}
          {req.submitted_at ? `. Sent in ${new Date(req.submitted_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.` : ""}
        </p>
      </div>

      {req.status !== "provisioned" && req.status !== "archived" && (
        <OwnerLinkCard id={req.id} link={ownerLink(origin, req.token)} canEmail={Boolean(req.owner_email)} />
      )}
      <SetupPanel
        id={req.id}
        status={req.status}
        log={req.provision_log}
        missing={progress.missing}
        suggestedMode={a.payments?.method === "stripe" ? "connect" : "platform"}
        currentMode={live?.payment_mode ?? null}
        chargesEnabled={Boolean(live?.stripe_charges_enabled)}
      />

      <div className="rounded-xl border border-border bg-card px-4">
        <p className="pt-4 text-sm font-medium text-foreground">Their answers</p>
        <dl className="divide-y divide-border">
          <Item label="Owner">
            {a.owner?.name ? `${a.owner.name}, ${a.owner.email ?? "no email"}${a.owner.phone ? `, ${a.owner.phone}` : ""}` : null}
          </Item>
          <Item label="Business">
            {a.business?.name ? (
              <>
                {a.business.name}
                <span className="block text-muted-foreground">
                  {[a.business.contactEmail, a.business.contactPhone, a.business.area].filter(Boolean).join(" · ") || "Using the owner's contact details"}
                </span>
              </>
            ) : null}
          </Item>
          <Item label="Address">{address}</Item>
          <Item label="Look">
            {a.brand?.color ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: a.brand.color }} />
                {a.brand.color}, {a.brand.headerStyle === "brand" ? "colour top bar" : "light top bar"}
                {a.brand.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- owner uploaded logo
                  <img src={a.brand.logoUrl} alt="Logo" className="ml-2 h-8 w-auto max-w-28 object-contain" />
                )}
              </span>
            ) : null}
          </Item>
          <Item label="Services">
            {a.services && a.services.length > 0 ? (
              <ul className="space-y-1">
                {a.services.map((s, i) => (
                  <li key={s?.key ?? i}>
                    {s?.name || "Unnamed"}
                    <span className="text-muted-foreground">
                      {" "}
                      {s?.walkthrough
                        ? "free visit"
                        : s?.pricing === "hourly"
                          ? `${formatPence(poundsToPence(s.price ?? 0))} an hour`
                          : s?.pricing === "quote"
                            ? `from ${formatPence(poundsToPence(s.price ?? 0))}, quoted per job`
                            : formatPence(poundsToPence(s?.price ?? 0))}
                      {s?.minutes ? `, ${s.minutes} min` : ""}
                      {s?.travelMinutes ? ` + ${s.travelMinutes} travel` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Item>
          <Item label="Team">
            {a.team?.ownerCleans || (a.team?.cleaners?.length ?? 0) > 0 ? (
              <>
                {[a.team?.ownerCleans ? `${a.owner?.name ?? "Owner"} (owner)` : null, ...(a.team?.cleaners ?? []).map((c) => c?.name)].filter(Boolean).join(", ")}
                <span className="block text-muted-foreground">
                  {days.map((d) => `${DAY_NAMES[d.day].slice(0, 3)} ${d.start} to ${d.end}`).join(", ") || "No working days"}
                  {a.hours?.timezone ? `, ${a.hours.timezone}` : ""}
                </span>
              </>
            ) : null}
          </Item>
          <Item label="Payments">
            {a.payments?.method
              ? `${a.payments.method === "stripe" ? "Wants card payments connected" : a.payments.method === "later" ? "Not yet" : "Not sure"}${a.payments.notes ? `. ${a.payments.notes}` : ""}`
              : null}
          </Item>
          {a.notes && <Item label="Other notes">{a.notes}</Item>}
        </dl>
      </div>

      <DangerZone
        id={req.id}
        name={req.business_name || "this request"}
        slug={businessRow?.slug ?? null}
        counts={bookings ? { bookings: bookings.count ?? 0, customers: customers?.count ?? 0, payments: payments?.count ?? 0 } : null}
        isMain={businessRow?.slug === DEFAULT_BUSINESS_SLUG}
      />
    </div>
  );
}
