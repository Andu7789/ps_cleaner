import { AdminsManager } from "@/components/platform/admins-manager";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { createServiceClient } from "@/lib/supabase/server";

export default async function PlatformAdminsPage() {
  const me = await requirePlatformAdmin();
  const { data } = await createServiceClient()
    .from("PS_CLEAN_platform_admins")
    .select("id, email, user_id")
    .order("created_at", { ascending: true });

  const admins = (data ?? []).map((a) => ({
    id: a.id as string,
    email: a.email as string,
    signedIn: Boolean(a.user_id),
    isYou: a.user_id === me.id || a.email === me.email?.toLowerCase(),
  }));

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Platform admins</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        People who can sign in to this portal to set up and delete businesses. Separate from a business&apos;s own owner and staff.
      </p>
      <div className="mt-5">
        <AdminsManager admins={admins} />
      </div>
    </div>
  );
}
