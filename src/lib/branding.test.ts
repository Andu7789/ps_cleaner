import { describe, expect, it } from "vitest";
import { brandCss, pickDominantColors, readableTextOn, watermarkStyle } from "./branding";

const base = {
  brand_color: "#0f766e",
  logo_url: "https://example.com/logo.png",
  background_style: "neutral" as const,
  header_style: "light" as const,
  logo_watermark: true,
  watermark_opacity: 8,
  watermark_position: "center" as const,
  watermark_size: 60,
};

describe("readableTextOn", () => {
  it("uses white on dark colours and dark text on pale ones", () => {
    expect(readableTextOn("#1e3a8a")).toBe("#ffffff");
    expect(readableTextOn("#fde68a")).toBe("#111827");
  });
  it("falls back to white for invalid input", () => {
    expect(readableTextOn("teal")).toBe("#ffffff");
  });
});

describe("brandCss", () => {
  it("only tints surfaces when asked", () => {
    expect(brandCss(base)).not.toContain("--background");
    expect(brandCss({ ...base, background_style: "tinted" })).toContain("--background");
  });
  it("ignores an invalid colour", () => {
    expect(brandCss({ ...base, brand_color: "red; } body { display:none" })).toContain("#0f766e");
  });
});

describe("watermarkStyle", () => {
  it("is off without a logo or when disabled", () => {
    expect(watermarkStyle({ ...base, logo_url: null })).toBeNull();
    expect(watermarkStyle({ ...base, logo_watermark: false })).toBeNull();
  });
  it("converts percent opacity", () => {
    expect(watermarkStyle(base)?.opacity).toBe("0.08");
  });
  it("repeats when tiled", () => {
    expect(watermarkStyle({ ...base, watermark_position: "tiled" })?.backgroundRepeat).toBe("repeat");
  });
});

describe("pickDominantColors", () => {
  it("skips transparent and white pixels and returns the common colour", () => {
    const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
    const data = [...px(255, 255, 255), ...px(10, 100, 200), ...px(10, 100, 200), ...px(0, 0, 0, 0)];
    expect(pickDominantColors(data, 3)).toEqual(["#0a64c8"]);
  });
});
