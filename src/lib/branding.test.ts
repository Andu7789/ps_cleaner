import { describe, expect, it } from "vitest";
import { backgroundAttrs, brandCss, pickDominantColors, readableTextOn } from "./branding";

const base = {
  brand_color: "#0f766e",
  logo_url: "https://example.com/logo.png",
  background_style: "neutral" as const,
  background_color: null,
  header_style: "light" as const,
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
  it("uses a custom background colour over the style", () => {
    const css = brandCss({ ...base, background_style: "tinted", background_color: "#fdf2f8" });
    expect(css).toContain("--background: #fdf2f8");
    expect(brandCss({ ...base, background_color: "red" })).not.toContain("--background");
  });
  it("flips text to light on a dark custom background", () => {
    expect(brandCss({ ...base, background_color: "#6a0724" })).toContain("--foreground: #ffffff");
    expect(brandCss({ ...base, background_color: "#fdf2f8" })).toContain("--foreground: #111827");
  });
  it("ignores an invalid colour", () => {
    expect(brandCss({ ...base, brand_color: "red; } body { display:none" })).toContain("#0f766e");
  });
});

describe("pickDominantColors", () => {
  it("skips transparent and white pixels and returns the common colour", () => {
    const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
    const data = [...px(255, 255, 255), ...px(10, 100, 200), ...px(10, 100, 200), ...px(0, 0, 0, 0)];
    expect(pickDominantColors(data, 3)).toEqual(["#0a64c8"]);
  });
});

describe("backgroundAttrs", () => {
  it("is empty without a custom background", () => {
    expect(backgroundAttrs(base)).toEqual({});
  });
  it("flags a brand colour too close to the page colour", () => {
    expect(backgroundAttrs({ ...base, brand_color: "#6a0724", background_color: "#6a0724" })).toHaveProperty("data-brand-low");
    expect(backgroundAttrs({ ...base, background_color: "#fdf2f8" })).not.toHaveProperty("data-brand-low");
  });
});
