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

export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function requireAdmin() {
  const user = await getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/admin/login");
  return user;
}

export async function requireOwner() {
  const user = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (data?.role !== "owner") redirect("/admin");
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

  if (!user.email) redirect("/cleaner/login");
  const service = createServiceClient();
  const { data: byEmail } = await service
    .from("PS_CLEAN_cleaners")
    .select("*")
    .ilike("email", user.email)
    .eq("is_active", true)
    .is("user_id", null)
    .maybeSingle();
  if (!byEmail) redirect("/cleaner/login");

  const { data: linked, error } = await service
    .from("PS_CLEAN_cleaners")
    .update({ user_id: user.id })
    .eq("id", byEmail.id)
    .select("*")
    .single();
  if (error || !linked) redirect("/cleaner/login");

  return { user, cleaner: linked as Cleaner };
}
