import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "./types";

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
