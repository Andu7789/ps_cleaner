import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { AdminTeamManager } from "@/components/admin/admin-team-manager";
import type { AdminUser } from "@/lib/types";

export default async function AdminTeamPage() {
  const user = await requireOwner();
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_admin_users")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true });
  const admins = (data ?? []) as AdminUser[];

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Team</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage who can access the admin panel, and who has full owner access (billing, settings, and this page).
      </p>
      <div className="mt-4">
        <AdminTeamManager admins={admins} currentUserId={user.id} />
      </div>
    </div>
  );
}
