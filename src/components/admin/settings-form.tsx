"use client";

import { useState, useTransition } from "react";
import { updateBusinessSettingsAction } from "@/lib/actions/admin";
import type { BusinessSettings } from "@/lib/types";

export function SettingsForm({ settings }: { settings: BusinessSettings }) {
  const [businessName, setBusinessName] = useState(settings.business_name);
  const [contactEmail, setContactEmail] = useState(settings.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(settings.contact_phone ?? "");
  const [timezone, setTimezone] = useState(settings.timezone);
  const [reminderHoursBefore, setReminderHoursBefore] = useState(settings.reminder_hours_before);
  const [balanceChargeDaysBefore, setBalanceChargeDaysBefore] = useState(settings.balance_charge_days_before);
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
