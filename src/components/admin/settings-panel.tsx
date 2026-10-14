"use client";

import { useState } from "react";
import { AppearanceForm } from "@/components/admin/appearance-form";
import { SettingsForm } from "@/components/admin/settings-form";
import type { Business } from "@/lib/types";

// Holds the logo shared by the business details form (where it is uploaded)
// and the look and feel editor (where it is previewed), so a new logo shows
// in the preview straight away.
export function SettingsPanel({ settings }: { settings: Business }) {
  const [logoUrl, setLogoUrl] = useState(settings.logo_url ?? "");

  return (
    <>
      <div className="mt-4">
        <SettingsForm settings={settings} onLogoChange={setLogoUrl} />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-foreground">Look and feel</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Match the site to your branding. Try the options and watch the preview, nothing goes live until you save.
      </p>
      <div className="mt-4">
        <AppearanceForm business={settings} logoUrl={logoUrl} />
      </div>
    </>
  );
}
