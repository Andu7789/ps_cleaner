import type { Business, WatermarkPosition } from "@/lib/types";

export type BrandingFields = Pick<
  Business,
  | "brand_color"
  | "logo_url"
  | "background_style"
  | "header_style"
  | "logo_watermark"
  | "watermark_opacity"
  | "watermark_position"
  | "watermark_size"
>;

export const BRAND_PRESETS: { name: string; hex: string }[] = [
  { name: "Teal", hex: "#0f766e" },
  { name: "Navy", hex: "#1e3a8a" },
  { name: "Sky", hex: "#0369a1" },
  { name: "Forest", hex: "#166534" },
  { name: "Plum", hex: "#86198f" },
  { name: "Berry", hex: "#be123c" },
  { name: "Coral", hex: "#c2410c" },
  { name: "Charcoal", hex: "#1f2937" },
];

export const WATERMARK_POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "center", label: "Centre" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "tiled", label: "Repeating" },
];

function channel(hex: string, start: number): number {
  const v = parseInt(hex.slice(start, start + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

// White or near black, whichever reads better on top of the brand colour, so
// a pale brand colour doesn't end up with unreadable white button text.
export function readableTextOn(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";
  const l = luminance(hex);
  const whiteContrast = 1.05 / (l + 0.05);
  const darkContrast = (l + 0.05) / 0.05;
  return whiteContrast >= darkContrast ? "#ffffff" : "#111827";
}

// Where and how big the faded logo sits, as plain CSS properties. Shared by
// the live site and the preview in the admin so they can't drift apart.
export function watermarkStyle(b: BrandingFields, scale = 1): Record<string, string> | null {
  if (!b.logo_watermark || !b.logo_url) return null;
  const size = b.watermark_size * scale;
  const base: Record<string, string> = {
    backgroundImage: `url("${b.logo_url.replace(/"/g, "%22")}")`,
    opacity: String(b.watermark_opacity / 100),
    backgroundRepeat: "no-repeat",
    backgroundSize: `${size}vmin auto`,
    backgroundPosition: "center",
  };
  switch (b.watermark_position) {
    case "top-right":
      return { ...base, backgroundPosition: "right 4vmin top 12vmin" };
    case "bottom-right":
      return { ...base, backgroundPosition: "right 4vmin bottom 4vmin" };
    case "tiled":
      return { ...base, backgroundRepeat: "repeat", backgroundSize: `${Math.max(14, size / 3)}vmin auto` };
    default:
      return base;
  }
}

// CSS custom properties for a business. --brand drives every bg-brand /
// text-brand utility; the rest tint surfaces from it.
export function brandVars(b: Pick<BrandingFields, "brand_color" | "background_style">): Record<string, string> {
  const brand = /^#[0-9a-fA-F]{6}$/.test(b.brand_color) ? b.brand_color : "#0f766e";
  const vars: Record<string, string> = { "--brand": brand, "--brand-foreground": readableTextOn(brand) };
  if (b.background_style === "tinted") {
    vars["--background"] = `color-mix(in srgb, ${brand} 7%, #ffffff)`;
    vars["--muted"] = `color-mix(in srgb, ${brand} 12%, #ffffff)`;
    vars["--border"] = `color-mix(in srgb, ${brand} 18%, #e5e7eb)`;
  }
  return vars;
}

export function brandCss(b: Pick<BrandingFields, "brand_color" | "background_style">): string {
  const decls = Object.entries(brandVars(b)).map(([k, v]) => `${k}: ${v};`);
  return `:root { ${decls.join(" ")} }`;
}

// Pulls a handful of distinct, reasonably saturated colours out of the logo
// so the owner can pick their brand colour straight from it. Runs in the
// browser (canvas); returns [] if the image can't be read (e.g. blocked by
// CORS) so the caller just shows no suggestions.
export async function dominantColorsFromImage(url: string, count = 5): Promise<string[]> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    return pickDominantColors(data, count);
  } catch {
    return [];
  }
}

// Buckets pixels (4 bits per channel), ignoring transparent, near white and
// near black ones, then returns the most common buckets that are visibly
// different from each other.
export function pickDominantColors(data: ArrayLike<number>, count: number): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 240 && min > 225) continue; // white-ish
    if (max < 25) continue; // black-ish
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  const sorted = [...buckets.values()].sort((x, y) => y.n - x.n);
  const picked: [number, number, number][] = [];
  for (const bucket of sorted) {
    const c: [number, number, number] = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n];
    const distinct = picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 60);
    if (distinct) picked.push(c);
    if (picked.length >= count) break;
  }
  return picked.map(([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`);
}
