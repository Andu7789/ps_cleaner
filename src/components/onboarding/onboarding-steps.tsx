"use client";

import { useEffect, useRef, useState } from "react";
import { checkSlugAction, uploadLogoAction } from "@/lib/actions/onboarding";
import { makeSquareIcon } from "@/components/admin/settings-form";
import { BRAND_PRESETS, dominantColorsFromImage, readableTextOn } from "@/lib/branding";
import { formatPence } from "@/lib/format";
import {
  DAY_NAMES,
  DAY_ORDER,
  SERVICE_TEMPLATES,
  newKey,
  poundsToPence,
  suggestSlug,
  type Answers,
  type ServiceAnswer,
} from "@/lib/onboarding";
import { Field, Segmented, StepHeading, Toggle, inputClass } from "./form-parts";

export type SetAnswers = (updater: (a: Answers) => Answers) => void;
interface StepProps {
  a: Answers;
  set: SetAnswers;
}

const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];
const TRAVEL = [0, 15, 30, 45, 60];
const TIMEZONES = ["Europe/London", "Europe/Dublin", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function YouStep({ a, set }: StepProps) {
  return (
    <div>
      <StepHeading title="Let's start with you" lead="A few details so we know who we're setting this up for. Your customers will see the business details, not your login." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name">
          <input className={inputClass} autoComplete="name" value={a.owner.name} onChange={(e) => set((x) => ({ ...x, owner: { ...x.owner, name: e.target.value } }))} />
        </Field>
        <Field label="Your email" hint="This is what you'll sign in with.">
          <input className={inputClass} type="email" autoComplete="email" value={a.owner.email} onChange={(e) => set((x) => ({ ...x, owner: { ...x.owner, email: e.target.value } }))} />
        </Field>
        <Field label="Your mobile" hint="Optional.">
          <input className={inputClass} type="tel" autoComplete="tel" value={a.owner.phone} onChange={(e) => set((x) => ({ ...x, owner: { ...x.owner, phone: e.target.value } }))} />
        </Field>
        <Field label="Business name" hint="As customers should see it.">
          <input
            className={inputClass}
            autoComplete="organization"
            value={a.business.name}
            onChange={(e) => set((x) => ({ ...x, business: { ...x.business, name: e.target.value } }))}
          />
        </Field>
        <Field label="Contact email for customers" hint="Leave blank to use your own email.">
          <input className={inputClass} type="email" value={a.business.contactEmail} onChange={(e) => set((x) => ({ ...x, business: { ...x.business, contactEmail: e.target.value } }))} />
        </Field>
        <Field label="Contact phone for customers" hint="Leave blank to use your mobile.">
          <input className={inputClass} type="tel" value={a.business.contactPhone} onChange={(e) => set((x) => ({ ...x, business: { ...x.business, contactPhone: e.target.value } }))} />
        </Field>
        <Field label="Where do you work?" hint="Towns or postcodes you cover. Optional." className="sm:col-span-2">
          <input className={inputClass} placeholder="e.g. Norwich and 10 miles around" value={a.business.area} onChange={(e) => set((x) => ({ ...x, business: { ...x.business, area: e.target.value } }))} />
        </Field>
      </div>
    </div>
  );
}

type SlugState = { status: "idle" | "checking" | "ok" | "bad"; message: string };

export function AddressStep({
  a,
  set,
  token,
  onSlugState,
}: StepProps & { token: string; onSlugState: (s: SlugState) => void }) {
  const [state, setState] = useState<SlugState>({ status: "idle", message: "" });
  const touched = useRef(false);

  // Offer an address from the business name until they type their own.
  useEffect(() => {
    if (!touched.current && !a.address.slug && a.business.name) {
      const suggestion = suggestSlug(a.business.name);
      if (suggestion.length >= 3) set((x) => ({ ...x, address: { ...x.address, slug: suggestion } }));
    }
  }, [a.address.slug, a.business.name, set]);

  useEffect(() => {
    const slug = a.address.slug;
    if (!slug) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const checking: SlugState = { status: "checking", message: "Checking…" };
      setState(checking);
      onSlugState(checking);
      const result = await checkSlugAction(token, slug);
      if (cancelled) return;
      const next: SlugState = { status: result.available ? "ok" : "bad", message: result.message };
      setState(next);
      onSlugState(next);
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [a.address.slug, token, onSlugState]);

  return (
    <div>
      <StepHeading title="Your web address" lead="Where customers will find and book you. Pick something short they'll remember." />
      <Field label="Your address">
        <div className="mt-1.5 flex items-stretch overflow-hidden rounded-xl border border-border bg-card focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <input
            className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-[15px] text-foreground outline-none"
            value={a.address.slug}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => {
              touched.current = true;
              set((x) => ({ ...x, address: { ...x.address, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") } }));
            }}
          />
          <span className="flex items-center bg-muted px-3.5 text-sm text-muted-foreground">.psclean.site</span>
        </div>
      </Field>
      <p
        aria-live="polite"
        className={`mt-2 min-h-5 text-sm ${state.status === "ok" ? "text-success" : state.status === "bad" ? "text-danger" : "text-muted-foreground"}`}
      >
        {state.message}
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <Field label="Already have your own domain? (optional)" hint="We'll show it instead of the address above. We'll help you connect it, you don't need to do anything now.">
          <input
            className={inputClass}
            placeholder="www.yourbusiness.co.uk"
            autoCapitalize="none"
            value={a.address.customDomain}
            onChange={(e) => set((x) => ({ ...x, address: { ...x.address, customDomain: e.target.value.trim().toLowerCase() } }))}
          />
        </Field>
      </div>
    </div>
  );
}

export function BrandStep({ a, set, token }: StepProps & { token: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<string[]>([]);

  useEffect(() => {
    if (!a.brand.logoUrl) return;
    let cancelled = false;
    dominantColorsFromImage(a.brand.logoUrl, 5).then((colors) => {
      if (!cancelled) setSuggested(colors);
    });
    return () => {
      cancelled = true;
    };
  }, [a.brand.logoUrl]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const icon = await makeSquareIcon(file);
      if (icon) body.append("icon", icon, "icon.png");
      const result = await uploadLogoAction(token, body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      set((x) => ({ ...x, brand: { ...x.brand, logoUrl: result.logoUrl, iconUrl: result.iconUrl } }));
    } catch {
      setError("That upload didn't work. Try a smaller image.");
    } finally {
      setUploading(false);
    }
  }

  const color = a.brand.color;
  const onBrand = readableTextOn(color);
  const swatches = [...suggested, ...BRAND_PRESETS.map((p) => p.hex)];

  return (
    <div>
      <StepHeading title="Make it look like you" lead="Your logo and a colour. You can change all of this later." />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-foreground">Logo</p>
            <p className="mt-0.5 text-xs text-muted-foreground">PNG, JPG, WebP or SVG, up to 800KB. No logo yet? Skip this, your name shows instead.</p>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex h-20 w-32 items-center justify-center rounded-xl border border-dashed border-border bg-card">
                {a.brand.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user uploaded logo
                  <img src={a.brand.logoUrl} alt="Your logo" className="max-h-16 max-w-28 object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">No logo</span>
                )}
              </div>
              <div className="flex flex-col items-start gap-2">
                <label className="cursor-pointer rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-foreground/30">
                  {uploading ? "Uploading…" : a.brand.logoUrl ? "Replace logo" : "Upload logo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={uploading} onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
                {a.brand.logoUrl && (
                  <button type="button" className="text-xs text-muted-foreground underline" onClick={() => set((x) => ({ ...x, brand: { ...x.brand, logoUrl: "", iconUrl: "" } }))}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">Main colour</p>
            {suggested.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">The first few are taken from your logo.</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {swatches.map((hex, i) => (
                <button
                  key={`${hex}-${i}`}
                  type="button"
                  aria-label={`Use ${hex}`}
                  aria-pressed={color.toLowerCase() === hex.toLowerCase()}
                  onClick={() => set((x) => ({ ...x, brand: { ...x.brand, color: hex } }))}
                  className={`h-9 w-9 rounded-full border-2 ${color.toLowerCase() === hex.toLowerCase() ? "border-foreground" : "border-border"}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
              <label className="ml-1 flex items-center gap-2 text-xs text-muted-foreground">
                Or pick any
                <input type="color" value={color} onChange={(e) => set((x) => ({ ...x, brand: { ...x.brand, color: e.target.value } }))} className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-card" />
              </label>
            </div>
          </div>

          <Segmented
            legend="Top bar"
            value={a.brand.headerStyle}
            onChange={(v) => set((x) => ({ ...x, brand: { ...x.brand, headerStyle: v } }))}
            options={[
              { value: "light", label: "Light", hint: "White, logo stands out" },
              { value: "brand", label: "Your colour", hint: "Bold, in your colour" },
            ]}
          />
        </div>

        <div aria-hidden="true">
          <p className="text-sm font-medium text-foreground">Preview</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
            <div
              className="flex items-center gap-2 border-b px-4 py-3"
              style={a.brand.headerStyle === "brand" ? { backgroundColor: color, color: onBrand, borderColor: "transparent" } : { backgroundColor: "#fff", borderColor: "#e5e7eb" }}
            >
              {a.brand.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- user uploaded logo
                <img src={a.brand.logoUrl} alt="" className="h-6 w-auto max-w-24 object-contain" />
              )}
              <span className="text-sm font-semibold">{a.business.name || "Your business"}</span>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-sm font-medium text-foreground">{a.services[0]?.name || "Regular home clean"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Book online in a minute</p>
              </div>
              <div className="rounded-xl px-4 py-2.5 text-center text-sm font-semibold" style={{ backgroundColor: color, color: onBrand }}>
                Book now
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function blankService(): ServiceAnswer {
  return { key: newKey(), name: "", description: "", pricing: "hourly", price: 18, minutes: 120, travelMinutes: 30, walkthrough: false };
}

function ServiceCard({ s, index, onChange, onRemove }: { s: ServiceAnswer; index: number; onChange: (s: ServiceAnswer) => void; onRemove: () => void }) {
  const durations = DURATIONS.includes(s.minutes) ? DURATIONS : [...DURATIONS, s.minutes].sort((x, y) => x - y);
  const total = s.pricing === "hourly" ? formatPence(Math.round((poundsToPence(s.price) * s.minutes) / 60)) : null;
  const priceLabel = s.pricing === "hourly" ? "Price per hour (£)" : s.pricing === "fixed" ? "Price (£)" : "Estimate shown as “from” (£)";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Service {index + 1}</p>
        <button type="button" onClick={onRemove} className="text-xs text-muted-foreground underline">
          Remove
        </button>
      </div>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <input className={inputClass} value={s.name} onChange={(e) => onChange({ ...s, name: e.target.value })} />
        </Field>
        <Field label="Short description" hint="Optional. Customers see this." className="sm:col-span-2">
          <input className={inputClass} value={s.description ?? ""} onChange={(e) => onChange({ ...s, description: e.target.value })} />
        </Field>

        <div className="sm:col-span-2">
          <Toggle
            checked={s.walkthrough}
            onChange={(v) => onChange(v ? { ...s, walkthrough: true, pricing: "fixed", price: 0 } : { ...s, walkthrough: false })}
            label="This is a free visit to see the job"
            hint="Customers say how many rooms they have, and you quote afterwards."
          />
        </div>

        {!s.walkthrough && (
          <>
            <div className="sm:col-span-2">
              <Segmented
                legend="How do you charge?"
                value={s.pricing}
                onChange={(v) => onChange({ ...s, pricing: v })}
                options={[
                  { value: "hourly", label: "By the hour", hint: "Rate × time" },
                  { value: "fixed", label: "Fixed price", hint: "One price" },
                  { value: "quote", label: "Quote first", hint: "You confirm each job" },
                ]}
              />
            </div>
            <Field label={priceLabel}>
              <input className={inputClass} type="number" inputMode="decimal" min={0} step="0.5" value={s.price} onChange={(e) => onChange({ ...s, price: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
          </>
        )}
        <Field label="How long does it take?" hint={total ? `Works out at ${total} per visit.` : undefined}>
          <select className={inputClass} value={s.minutes} onChange={(e) => onChange({ ...s, minutes: Number(e.target.value) })}>
            {durations.map((m) => (
              <option key={m} value={m}>
                {durationLabel(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Travel time after" hint="Blocked in the diary so cleaners aren't rushed.">
          <select className={inputClass} value={s.travelMinutes} onChange={(e) => onChange({ ...s, travelMinutes: Number(e.target.value) })}>
            {TRAVEL.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "None" : durationLabel(m)}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

export function ServicesStep({ a, set }: StepProps) {
  const used = new Set(a.services.map((s) => s.name.toLowerCase()));
  return (
    <div>
      <StepHeading title="What do you offer?" lead="Tap a starting point and adjust it, or add your own. Prices and times are easy to change later." />
      <div className="mb-4 flex flex-wrap gap-2">
        {SERVICE_TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={used.has(t.service.name.toLowerCase()) || a.services.length >= 12}
            onClick={() => set((x) => ({ ...x, services: [...x.services, { ...t.service, key: newKey() }] }))}
            className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground hover:border-brand disabled:opacity-40"
          >
            + {t.label}
          </button>
        ))}
        <button
          type="button"
          disabled={a.services.length >= 12}
          onClick={() => set((x) => ({ ...x, services: [...x.services, blankService()] }))}
          className="rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:border-brand"
        >
          + Something else
        </button>
      </div>
      <div className="space-y-4">
        {a.services.map((s, i) => (
          <ServiceCard
            key={s.key}
            s={s}
            index={i}
            onChange={(next) => set((x) => ({ ...x, services: x.services.map((y) => (y.key === s.key ? next : y)) }))}
            onRemove={() => set((x) => ({ ...x, services: x.services.filter((y) => y.key !== s.key) }))}
          />
        ))}
        {a.services.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nothing yet. Tap one of the buttons above to begin.</p>}
      </div>
    </div>
  );
}

export function TeamStep({ a, set }: StepProps) {
  return (
    <div>
      <StepHeading title="Your team and hours" lead="Who does the cleaning, and when are they available? Each cleaner gets a sign in so they can see their own jobs." />

      <div className="space-y-3">
        <Toggle
          checked={a.team.ownerCleans}
          onChange={(v) => set((x) => ({ ...x, team: { ...x.team, ownerCleans: v } }))}
          label="I do cleans myself"
          hint={`We'll add ${a.owner.name || "you"} as a cleaner too.`}
        />
        {a.team.cleaners.map((c, i) => (
          <div key={c.key} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cleaner {i + 1}</p>
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => set((x) => ({ ...x, team: { ...x.team, cleaners: x.team.cleaners.filter((y) => y.key !== c.key) } }))}>
                Remove
              </button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Field label="Name">
                <input className={inputClass} value={c.name} onChange={(e) => set((x) => ({ ...x, team: { ...x.team, cleaners: x.team.cleaners.map((y) => (y.key === c.key ? { ...y, name: e.target.value } : y)) } }))} />
              </Field>
              <Field label="Email" hint="For their sign in.">
                <input className={inputClass} type="email" value={c.email} onChange={(e) => set((x) => ({ ...x, team: { ...x.team, cleaners: x.team.cleaners.map((y) => (y.key === c.key ? { ...y, email: e.target.value } : y)) } }))} />
              </Field>
              <Field label="Mobile">
                <input className={inputClass} type="tel" value={c.phone} onChange={(e) => set((x) => ({ ...x, team: { ...x.team, cleaners: x.team.cleaners.map((y) => (y.key === c.key ? { ...y, phone: e.target.value } : y)) } }))} />
              </Field>
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={a.team.cleaners.length >= 20}
          onClick={() => set((x) => ({ ...x, team: { ...x.team, cleaners: [...x.team.cleaners, { key: newKey(), name: "", email: "", phone: "" }] } }))}
          className="rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:border-brand"
        >
          + Add a cleaner
        </button>
      </div>

      <div className="mt-8">
        <h3 className="text-base font-semibold text-foreground">When can they work?</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">One set of hours for everyone to start with. You can change it per cleaner later.</p>
        <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
          {DAY_ORDER.map((day) => {
            const d = a.hours.days.find((x) => x.day === day)!;
            const change = (patch: Partial<typeof d>) =>
              set((x) => ({ ...x, hours: { ...x.hours, days: x.hours.days.map((y) => (y.day === day ? { ...y, ...patch } : y)) } }));
            return (
              <div key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <label className="flex w-32 cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground">
                  <input type="checkbox" checked={d.on} onChange={(e) => change({ on: e.target.checked })} className="h-4 w-4 accent-[var(--brand)]" />
                  {DAY_NAMES[day]}
                </label>
                {d.on ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input aria-label={`${DAY_NAMES[day]} start`} type="time" value={d.start} onChange={(e) => change({ start: e.target.value })} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-foreground" />
                    to
                    <input aria-label={`${DAY_NAMES[day]} finish`} type="time" value={d.end} onChange={(e) => change({ end: e.target.value })} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-foreground" />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Day off</span>
                )}
              </div>
            );
          })}
        </div>
        <Field label="Timezone" className="mt-4 max-w-xs">
          <select className={inputClass} value={a.hours.timezone} onChange={(e) => set((x) => ({ ...x, hours: { ...x.hours, timezone: e.target.value } }))}>
            {(TIMEZONES.includes(a.hours.timezone) ? TIMEZONES : [a.hours.timezone, ...TIMEZONES]).map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

export function PaymentsStep({ a, set }: StepProps) {
  return (
    <div>
      <StepHeading
        title="Getting paid"
        lead="Customers don't pay online. You email them a quote and an invoice from your bookings list, and they pay you directly."
      />
      <Field label="Anything about payments we should know?" hint="Optional, for example how you like to be paid." className="mt-5">
        <textarea className={`${inputClass} min-h-20`} value={a.payments.notes} onChange={(e) => set((x) => ({ ...x, payments: { ...x.payments, notes: e.target.value } }))} />
      </Field>
      <Field label="Anything else?" hint="Special requests, things you want on the site, questions. Optional." className="mt-5">
        <textarea className={`${inputClass} min-h-24`} value={a.notes} onChange={(e) => set((x) => ({ ...x, notes: e.target.value }))} />
      </Field>
    </div>
  );
}
