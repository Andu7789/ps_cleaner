import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Cleaner, Customer } from "./types";

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function getCustomer(userId: string): Promise<Customer | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("PS_CLEAN_customers").select("*").eq("user_id", userId).maybeSingle();
  return (data as Customer | null) ?? null;
}

export async function requireCustomer() {
  const user = await requireUser();
  const customer = await getCustomer(user.id);
  if (!customer) redirect("/account/setup");
  return { user, customer };
}

// Same email-invite-then-link-on-first-login shape as requireCleaner()
// below — added once a "manage admins" UI actually existed to invite
// someone by email rather than the only prior path (a one-off direct SQL
// insert, see DECISIONS.md). Only the owner can create these rows
// (RLS + updateAdminAction/inviteAdminAction), but linking on first sign-in
// happens for any invited email, admin or owner.
async function getAdminRecord(userId: string, email: string | undefined) {
  const supabase = await createClient();
  const { data: byUserId } = await supabase
    .from("PS_CLEAN_admin_users")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (byUserId) return byUserId;

  if (!email) return null;
  const service = createServiceClient();
  const { data: byEmail } = await service
    .from("PS_CLEAN_admin_users")
    .select("*")
    .ilike("email", email)
    .is("user_id", null)
    .maybeSingle();
  if (!byEmail) return null;

  const { data: linked, error } = await service
    .from("PS_CLEAN_admin_users")
    .update({ user_id: userId })
    .eq("id", byEmail.id)
    .select("*")
    .single();
  return error ? null : linked;
}

export async function requireAdmin() {
  const user = await getUser();
  if (!user) redirect("/admin/login");
  const record = await getAdminRecord(user.id, user.email);
  if (!record) redirect("/admin/login?error=not_an_admin");
  return user;
}

export async function requireOwner() {
  const user = await requireAdmin();
  const record = await getAdminRecord(user.id, user.email ?? undefined);
  if (record?.role !== "owner") redirect("/admin");
  return user;
}

// Cleaners are added by the admin, never self-service (see DECISIONS.md
// #3) — so unlike requireCustomer, there is no "create your profile" page.
// The first time a cleaner signs in, their auth user has no matching
// PS_CLEAN_cleaners.user_id yet; link it by email instead of bouncing them
// to a signup form, since the row (created by the admin) already exists.
export async function requireCleaner(): Promise<{ user: Awaited<ReturnType<typeof requireUser>>; cleaner: Cleaner }> {
  const user = await getUser();
  if (!user) redirect("/cleaner/login");

  const supabase = await createClient();
  const { data: byUserId } = await supabase
    .from("PS_CLEAN_cleaners")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUserId) return { user, cleaner: byUserId as Cleaner };

  // Every redirect below used to be a bare `/cleaner/login` with no error
  // param — a genuinely signed-in user with no matching (or a deactivated)
  // cleaner record just silently bounced back to the sign-in form with
  // zero explanation, indistinguishable from a bad link. Found live when
  // reactivating a test cleaner: the loop was this, not an auth failure.
  if (!user.email) redirect("/cleaner/login?error=not_a_cleaner");
  const service = createServiceClient();
  const { data: byEmail } = await service
    .from("PS_CLEAN_cleaners")
    .select("*")
    .ilike("email", user.email)
    .eq("is_active", true)
    .is("user_id", null)
    .maybeSingle();
  if (!byEmail) redirect("/cleaner/login?error=not_a_cleaner");

  const { data: linked, error } = await service
    .from("PS_CLEAN_cleaners")
    .update({ user_id: user.id })
    .eq("id", byEmail.id)
    .select("*")
    .single();
  if (error || !linked) redirect("/cleaner/login?error=not_a_cleaner");

  return { user, cleaner: linked as Cleaner };
}
