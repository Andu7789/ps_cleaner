import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";

// Platform admins run the whole white label (onboarding new businesses). They
// are separate from a business's own admins: someone can own a business and
// not be a platform admin, and the other way round. Rows are invited by email
// and linked to the auth user on first sign in, same shape as business admins.
export async function requirePlatformAdmin() {
  const user = await getUser();
  if (!user) redirect("/platform/login");
  if (!(await isPlatformAdmin(user.id, user.email))) redirect("/platform/login?error=not_platform_admin");
  return user;
}

async function isPlatformAdmin(userId: string, email: string | undefined): Promise<boolean> {
  const service = createServiceClient();
  const { data: byUser } = await service
    .from("PS_CLEAN_platform_admins")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (byUser) return true;
  if (!email) return false;

  const { data: byEmail } = await service
    .from("PS_CLEAN_platform_admins")
    .select("id")
    .eq("email", email.toLowerCase())
    .is("user_id", null)
    .maybeSingle();
  if (!byEmail) return false;
  const { error } = await service.from("PS_CLEAN_platform_admins").update({ user_id: userId }).eq("id", byEmail.id);
  return !error;
}

export async function platformAdminEmails(): Promise<string[]> {
  const service = createServiceClient();
  const { data } = await service.from("PS_CLEAN_platform_admins").select("email");
  return (data ?? []).map((r) => r.email as string);
}
