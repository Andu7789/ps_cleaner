import type { Business } from "@/lib/types";

export type BrandingFields = Pick<
  Business,
  | "brand_color"
  | "logo_url"
  | "background_style"
  | "background_color"
  | "header_style"
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

function hasCustomBackground(b: Pick<BrandingFields, "background_color">): boolean {
  return Boolean(b.background_color && /^#[0-9a-fA-F]{6}$/.test(b.background_color));
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Attributes for the page root that switch on the custom background rules in
// globals.css: light cards on a coloured page, and an outline on brand
// blocks when the brand colour is too close to the page colour to see.
export function backgroundAttrs(b: Pick<BrandingFields, "brand_color" | "background_color">): Record<string, string> {
  if (!hasCustomBackground(b)) return {};
  const attrs: Record<string, string> = { "data-custom-bg": "" };
  if (/^#[0-9a-fA-F]{6}$/.test(b.brand_color) && contrast(b.brand_color, b.background_color as string) < 2.5) {
    attrs["data-brand-low"] = "";
  }
  return attrs;
}

// CSS custom properties for a business. --brand drives every bg-brand /
// text-brand utility; the rest tint surfaces from it.
export function brandVars(b: Pick<BrandingFields, "brand_color" | "background_style" | "background_color">): Record<string, string> {
  const brand = /^#[0-9a-fA-F]{6}$/.test(b.brand_color) ? b.brand_color : "#0f766e";
  const vars: Record<string, string> = { "--brand": brand, "--brand-foreground": readableTextOn(brand) };
  if (b.background_style === "tinted") {
    vars["--background"] = `color-mix(in srgb, ${brand} 7%, #ffffff)`;
    vars["--muted"] = `color-mix(in srgb, ${brand} 12%, #ffffff)`;
    vars["--border"] = `color-mix(in srgb, ${brand} 18%, #e5e7eb)`;
  }
  // A colour the owner picked wins over the tint. Text, muted text, dividers
  // and tints are all derived from it so a dark page still reads well; cards
  // keep their own light palette (see the data-custom-bg rule in globals.css).
  if (hasCustomBackground(b)) {
    const bg = b.background_color as string;
    const fg = readableTextOn(bg);
    vars["--background"] = bg;
    vars["--foreground"] = fg;
    vars["--muted"] = `color-mix(in srgb, ${fg} 8%, ${bg})`;
    vars["--muted-foreground"] = `color-mix(in srgb, ${fg} 72%, ${bg})`;
    vars["--border"] = `color-mix(in srgb, ${fg} 22%, ${bg})`;
  }
  return vars;
}

export function brandCss(b: Pick<BrandingFields, "brand_color" | "background_style" | "background_color">): string {
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
