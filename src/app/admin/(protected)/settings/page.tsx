import { getCurrentBusiness } from "@/lib/business";
import { SettingsForm } from "@/components/admin/settings-form";

export default async function AdminSettingsPage() {
  const settings = await getCurrentBusiness();

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Business details shown on the public site, and the timing of automatic reminders and balance charges.
      </p>
      <div className="mt-4">
        <SettingsForm settings={settings} />
      </div>
    </div>
  );
}
