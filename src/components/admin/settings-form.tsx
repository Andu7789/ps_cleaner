"use client";

import { useState, useTransition } from "react";
import { updateBusinessSettingsAction } from "@/lib/actions/admin";
import type { Business } from "@/lib/types";

export function SettingsForm({ settings }: { settings: Business }) {
  const [businessName, setBusinessName] = useState(settings.business_name);
  const [contactEmail, setContactEmail] = useState(settings.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(settings.contact_phone ?? "");
  const [timezone, setTimezone] = useState(settings.timezone);
  const [reminderHoursBefore, setReminderHoursBefore] = useState(settings.reminder_hours_before);
  const [balanceChargeDaysBefore, setBalanceChargeDaysBefore] = useState(settings.balance_charge_days_before);
  const [brandColor, setBrandColor] = useState(settings.brand_color);
  const [logoUrl, setLogoUrl] = useState(settings.logo_url ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateBusinessSettingsAction({
          businessName,
          contactEmail,
          contactPhone,
          timezone,
          reminderHoursBefore,
          balanceChargeDaysBefore,
          brandColor,
          logoUrl,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save settings");
      }
    });
  }

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
      <div>
        <label className="text-xs text-muted-foreground">Business name</label>
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Brand color</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-9 w-12 shrink-0 rounded-lg border border-border p-1"
              aria-label="Brand color"
            />
            <input
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#0f766e"
              className="block w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Used for buttons, links, and the browser theme color across the site.</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Logo URL (optional)</label>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Link to an already-hosted image — shown in the header and used as the site/app icon. Leave blank to use the default icon.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Contact email</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="hello@example.com"
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Contact phone</label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="01234 567890"
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Timezone</label>
        <input
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="Europe/London"
          className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          For reference — working hours and slots are computed against Europe/London regardless of this value.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Reminder — hours before the job</label>
          <input
            type="number"
            min={1}
            value={reminderHoursBefore}
            onChange={(e) => setReminderHoursBefore(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Balance charge — days before the job</label>
          <input
            type="number"
            min={0}
            value={balanceChargeDaysBefore}
            onChange={(e) => setBalanceChargeDaysBefore(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        disabled={pending}
        onClick={handleSave}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Saving…" : saved ? "Saved!" : "Save settings"}
      </button>
    </div>
  );
}
