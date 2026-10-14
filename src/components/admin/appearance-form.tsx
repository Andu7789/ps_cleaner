"use client";

import { useEffect, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { updateAppearanceAction } from "@/lib/actions/admin";
import {
  BRAND_PRESETS,
  WATERMARK_POSITIONS,
  brandVars,
  dominantColorsFromImage,
  watermarkStyle,
} from "@/lib/branding";
import type { Business } from "@/lib/types";

type Choice<T extends string> = { value: T; label: string; hint: string };

const BACKGROUNDS: Choice<"neutral" | "tinted">[] = [
  { value: "neutral", label: "Clean white", hint: "Plain light grey page" },
  { value: "tinted", label: "Brand tint", hint: "A soft wash of your colour" },
];
const HEADERS: Choice<"light" | "brand">[] = [
  { value: "light", label: "Light bar", hint: "White header, logo stands out" },
  { value: "brand", label: "Brand colour bar", hint: "Header in your colour" },
];

function Swatch({ hex, label, selected, onPick }: { hex: string; label: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`${label} ${hex}`}
      aria-pressed={selected}
      title={`${label} ${hex}`}
      className={`h-9 w-9 rounded-full border-2 ${selected ? "border-foreground" : "border-border"}`}
      style={{ backgroundColor: hex }}
    />
  );
}

function ChoiceCards<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: Choice<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium text-foreground">{legend}</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-lg border p-3 text-sm ${
              value === o.value ? "border-brand bg-brand/5" : "border-border"
            }`}
          >
            <input
              type="radio"
              name={legend}
              className="sr-only"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className="block font-medium text-foreground">{o.label}</span>
            <span className="block text-xs text-muted-foreground">{o.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Owner-facing look and feel editor. Everything changes the live preview
// straight away; nothing touches the real site until Save.
export function AppearanceForm({ business, logoUrl }: { business: Business; logoUrl: string }) {
  const [brandColor, setBrandColor] = useState(business.brand_color);
  const [backgroundStyle, setBackgroundStyle] = useState(business.background_style);
  const [headerStyle, setHeaderStyle] = useState(business.header_style);
  const [logoWatermark, setLogoWatermark] = useState(business.logo_watermark);
  const [opacity, setOpacity] = useState(business.watermark_opacity);
  const [position, setPosition] = useState(business.watermark_position);
  const [size, setSize] = useState(business.watermark_size);
  const [logoColors, setLogoColors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // A logo uploaded above but not saved yet still previews here, but the live
  // site can only use it once Save settings has stored it.
  const logoSaved = logoUrl === (business.logo_url ?? "");

  useEffect(() => {
    let cancelled = false;
    if (!logoUrl) return;
    dominantColorsFromImage(logoUrl).then((colors) => {
      if (!cancelled) setLogoColors(colors);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  const validColor = /^#[0-9a-fA-F]{6}$/.test(brandColor);
  const branding = {
    brand_color: validColor ? brandColor : business.brand_color,
    logo_url: logoUrl || null,
    background_style: backgroundStyle,
    header_style: headerStyle,
    logo_watermark: logoWatermark,
    watermark_opacity: opacity,
    watermark_position: position,
    watermark_size: size,
  };
  const vars = brandVars(branding) as CSSProperties;
  // The live site sizes the logo against the viewport (vmin); the preview is
  // a small box, so it uses container units instead.
  const rawWatermark = watermarkStyle(branding);
  const previewWatermark: CSSProperties | null = rawWatermark
    ? (Object.fromEntries(Object.entries(rawWatermark).map(([k, v]) => [k, v.replace(/vmin/g, "cqmin")])) as CSSProperties)
    : null;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateAppearanceAction({
          brandColor: branding.brand_color,
          backgroundStyle,
          headerStyle,
          logoWatermark: logoWatermark && Boolean(logoUrl),
          watermarkOpacity: opacity,
          watermarkPosition: position,
          watermarkSize: size,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6 rounded-xl border border-border bg-card p-5">
        <fieldset>
          <legend className="text-xs font-medium text-foreground">Brand colour</legend>
          <p className="mt-0.5 text-xs text-muted-foreground">Buttons, links and the browser theme colour.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {BRAND_PRESETS.map((p) => (
              <Swatch
                key={p.hex}
                hex={p.hex}
                label={p.name}
                selected={brandColor.toLowerCase() === p.hex}
                onPick={() => setBrandColor(p.hex)}
              />
            ))}
          </div>
          {logoColors.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">Colours from your logo</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {logoColors.map((hex) => (
                  <Swatch key={hex} hex={hex} label="Logo colour" selected={brandColor.toLowerCase() === hex} onPick={() => setBrandColor(hex)} />
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <input
              type="color"
              value={validColor ? brandColor : business.brand_color}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-9 w-12 shrink-0 rounded-lg border border-border p-1"
              aria-label="Pick any colour"
            />
            <input
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#0f766e"
              aria-label="Brand colour hex code"
              className="block w-32 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
            {!validColor && <span className="text-xs text-danger">Use a hex code like #0f766e</span>}
          </div>
        </fieldset>

        <ChoiceCards legend="Page background" value={backgroundStyle} options={BACKGROUNDS} onChange={setBackgroundStyle} />
        <ChoiceCards legend="Header" value={headerStyle} options={HEADERS} onChange={setHeaderStyle} />

        <fieldset>
          <legend className="text-xs font-medium text-foreground">Faded logo behind the pages</legend>
          {!logoUrl ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Upload a logo in Business details above, then you can fade it into the background here.
            </p>
          ) : (
            <div className="mt-2 space-y-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" className="accent-brand" checked={logoWatermark} onChange={(e) => setLogoWatermark(e.target.checked)} />
                Show my logo faded in the background
              </label>
              {logoWatermark && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Position</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {WATERMARK_POSITIONS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          aria-pressed={position === p.value}
                          onClick={() => setPosition(p.value)}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                            position === p.value ? "border-brand bg-brand/5 text-foreground" : "border-border text-muted-foreground"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block text-xs text-muted-foreground">
                    Strength: {opacity}% (lower is fainter, keep it low so text stays easy to read)
                    <input type="range" min={2} max={30} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="mt-1 block w-full accent-brand" />
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    Size: {size}%
                    <input type="range" min={20} max={100} step={5} value={size} onChange={(e) => setSize(Number(e.target.value))} className="mt-1 block w-full accent-brand" />
                  </label>
                </>
              )}
            </div>
          )}
        </fieldset>

        {!logoSaved && (
          <p className="text-sm text-danger">
            Your new logo isn&apos;t saved yet. Click Save settings in Business details above first, otherwise the faded
            logo won&apos;t appear on the site.
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="button"
          disabled={pending || !validColor}
          onClick={save}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : saved ? "Saved!" : "Save look and feel"}
        </button>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-1.5 text-xs font-medium text-foreground">Preview</p>
        <div
          style={{ ...vars, containerType: "size" }}
          className="relative h-80 overflow-hidden rounded-xl border border-border bg-background text-foreground"
        >
          {previewWatermark && <div aria-hidden="true" className="absolute inset-0" style={previewWatermark} />}
          <div className="relative flex h-full flex-col">
            <div
              className={`flex items-center justify-between border-b px-3 py-2 text-xs ${
                headerStyle === "brand" ? "border-transparent bg-brand text-brand-foreground" : "border-border bg-card"
              }`}
            >
              <span className="font-semibold">{business.business_name}</span>
              <span>Book a clean</span>
            </div>
            <div className="space-y-3 p-3">
              <div className="rounded-lg bg-brand p-3 text-brand-foreground">
                <p className="text-sm font-semibold">Book a trusted clean</p>
                <span className="mt-2 inline-block rounded-md bg-white px-2 py-1 text-xs font-semibold text-brand">Book now</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-semibold">Standard Clean</p>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">2 hr</span>
                  <span className="font-semibold text-brand">£60.00</span>
                </div>
              </div>
              <span className="inline-block rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground">Continue</span>
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Nothing changes on your site until you save.</p>
      </div>
    </div>
  );
}
