"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";

// Deliberately narrow and marked, not a general-purpose seeding tool: this
// exists to answer one specific request — "let me show off the invoice
// feature with one press" — not to become a backdoor for arbitrary data
// creation. See DECISIONS.md for why this replaced a literal "SQL tab"
// (this Supabase project is shared with several unrelated apps; a raw SQL
// console in the admin UI would be a real security hole, not just for
// this app's own data).
const DEMO_CUSTOMER_EMAIL = "demo-customer@example.com";
const DEMO_MARKER = "Demo data — safe to delete";

async function ensureDemoCustomer(service: ReturnType<typeof createServiceClient>, businessId: string) {
  const { data: existing } = await service
    .from("PS_CLEAN_customers")
    .select("id")
    .ilike("email", DEMO_CUSTOMER_EMAIL)
    .eq("business_id", businessId)
    .maybeSingle();

  let customerId = existing?.id as string | undefined;

  if (customerId) {
    const { data: address } = await service
      .from("PS_CLEAN_customer_addresses")
      .select("id")
      .eq("customer_id", customerId)
      .limit(1)
      .maybeSingle();
    if (address) return { customerId, addressId: address.id as string };
  } else {
    // Customer identity is global per login (see DECISIONS.md), and a
    // second business pressing this button would collide on the same
    // fixed demo email — a fresh auth user per business keeps each
    // business's demo customer independent.
    const { data: userData, error: userError } = await service.auth.admin.createUser({
      email: `demo-customer+${businessId}@example.com`,
      email_confirm: true,
    });
    if (userError) throw new Error(userError.message);

    const { data: customerRow, error: customerError } = await service
      .from("PS_CLEAN_customers")
      .insert({ business_id: businessId, user_id: userData.user.id, full_name: "Demo Customer", email: DEMO_CUSTOMER_EMAIL })
      .select("id")
      .single();
    if (customerError) throw new Error(customerError.message);
    customerId = customerRow.id as string;
  }

  const { data: addressRow, error: addressError } = await service
    .from("PS_CLEAN_customer_addresses")
    .insert({
      business_id: businessId,
      customer_id: customerId,
      label: "Demo address",
      line1: "1 Example Street",
      city: "Norwich",
      postcode: "NR1 1AA",
      is_default: true,
    })
    .select("id")
    .single();
  if (addressError) throw new Error(addressError.message);

  return { customerId, addressId: addressRow.id as string };
}

export interface SeedResult {
  created: number;
  skipped: number;
}

// One completed job per active, qualified cleaner, dated somewhere in the
// last ~10 days at a pseudo-random hour — enough spread that repeated
// presses don't collide with each other or with real bookings and trip
// the EXCLUDE double-booking constraint (DECISIONS.md #4). A collision on
// any single row is just skipped, never a partial/corrupt write.
export async function seedInvoiceDemoDataAction(): Promise<SeedResult> {
  await requireAdmin();
  const business = await getCurrentBusiness();
  const service = createServiceClient();
  const { customerId, addressId } = await ensureDemoCustomer(service, business.id);

  const { data: cleaners } = await service
    .from("PS_CLEAN_cleaners")
    .select("id")
    .eq("is_active", true)
    .eq("business_id", business.id);
  if (!cleaners || cleaners.length === 0) throw new Error("No active cleaners to create demo bookings for.");

  let created = 0;
  let skipped = 0;

  for (const cleaner of cleaners) {
    const { data: qualification } = await service
      .from("PS_CLEAN_cleaner_services")
      .select("service_id")
      .eq("cleaner_id", cleaner.id)
      .limit(1)
      .maybeSingle();
    if (!qualification) {
      skipped++;
      continue;
    }

    const { data: svc } = await service
      .from("PS_CLEAN_services")
      .select("*")
      .eq("id", qualification.service_id)
      .maybeSingle();
    if (!svc) {
      skipped++;
      continue;
    }

    const daysAgo = 1 + Math.floor(Math.random() * 10);
    const hour = 8 + Math.floor(Math.random() * 8);
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() - daysAgo);
    startsAt.setUTCHours(hour, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + svc.duration_minutes * 60_000);

    const { error } = await service.from("PS_CLEAN_bookings").insert({
      business_id: business.id,
      customer_id: customerId,
      cleaner_id: cleaner.id,
      service_id: svc.id,
      address_id: addressId,
      status: "completed",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      buffer_before_minutes: svc.buffer_before_minutes,
      buffer_after_minutes: svc.buffer_after_minutes,
      price_pence: svc.price_pence,
      deposit_pence: svc.deposit_pence ?? 0,
      amount_paid_pence: svc.price_pence,
      notes: DEMO_MARKER,
    });

    if (error) skipped++;
    else created++;
  }

  revalidatePath("/admin/invoices");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/reports");
  return { created, skipped };
}

// Only removes the demo bookings themselves, never any invoice already
// generated from them — PS_CLEAN_cleaner_invoice_items.booking_id is ON
// DELETE SET NULL (see DECISIONS.md #16), so a real invoice a demo booking
// was used to generate keeps its snapshot line items and total intact,
// exactly like any other historical invoice.
export async function clearInvoiceDemoDataAction(): Promise<number> {
  await requireAdmin();
  const business = await getCurrentBusiness();
  const service = createServiceClient();
  const { data, error } = await service
    .from("PS_CLEAN_bookings")
    .delete()
    .eq("notes", DEMO_MARKER)
    .eq("business_id", business.id)
    .select("id");
  if (error) throw new Error(error.message);
  revalidatePath("/admin/invoices");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/reports");
  return data?.length ?? 0;
}
