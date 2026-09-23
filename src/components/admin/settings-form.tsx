"use client";

import { useRef, useState, useTransition } from "react";
import { updateBusinessSettingsAction, uploadBusinessLogoAction } from "@/lib/actions/admin";
import type { Business } from "@/lib/types";

// Favicons and PWA icons must be square, so a rectangular logo is scaled to
// fit (never cropped or stretched) and centered on a transparent 512px canvas.
// Done here because the server has no image processing (sharp is stubbed).
async function makeSquareIcon(file: File): Promise<Blob | null> {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const size = 512;
    const w = img.naturalWidth || size;
    const h = img.naturalHeight || size;
    const scale = Math.min(size / w, size / h);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function SettingsForm({ settings }: { settings: Business }) {
  const [businessName, setBusinessName] = useState(settings.business_name);
  const [contactEmail, setContactEmail] = useState(settings.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(settings.contact_phone ?? "");
  const [timezone, setTimezone] = useState(settings.timezone);
  const [reminderHoursBefore, setReminderHoursBefore] = useState(settings.reminder_hours_before);
  const [balanceChargeDaysBefore, setBalanceChargeDaysBefore] = useState(settings.balance_charge_days_before);
  const [brandColor, setBrandColor] = useState(settings.brand_color);
  const [logoUrl, setLogoUrl] = useState(settings.logo_url ?? "");
  const [iconUrl, setIconUrl] = useState(settings.icon_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogoFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const icon = await makeSquareIcon(file);
      if (icon) body.append("icon", icon, "icon.png");
      const result = await uploadBusinessLogoAction(body);
      setLogoUrl(result.logoUrl);
      setIconUrl(result.iconUrl ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload logo");
    } finally {
      setUploading(false);
    }
  }

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
          iconUrl,
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
          <label className="text-xs text-muted-foreground" htmlFor="logo-file">Logo (optional)</label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleLogoFile(file);
            }}
            className={`mt-1 flex items-center gap-3 rounded-lg border border-dashed px-3 py-3 ${
              dragging ? "border-brand bg-brand/5" : "border-border"
            }`}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo preview
              <img src={logoUrl} alt="Current logo" className="h-12 max-w-32 shrink-0 rounded-md border border-border object-contain" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border text-xs text-muted-foreground">
                None
              </div>
            )}
            <div className="min-w-0 text-xs text-muted-foreground">
              <p>{uploading ? "Uploading…" : "Drag an image here, or"}</p>
              <div className="mt-1 flex gap-3">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                  className="font-semibold text-brand underline disabled:opacity-60"
                >
                  Choose file
                </button>
                {logoUrl && (
                  <button type="button" onClick={() => {
                      setLogoUrl("");
                      setIconUrl("");
                    }}
                    className="underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                id="logo-file"
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            PNG, JPG, WebP or SVG, up to 800KB. Shown in the header and used as the site/app icon. Any shape works: the header shows it as uploaded, and a square copy is made for the site/app icon. Remove it to use the default icon. Click Save settings to apply.
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
