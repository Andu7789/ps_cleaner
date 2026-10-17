import { describe, expect, it } from "vitest";
import {
  completeness,
  defaultHours,
  slugSchema,
  suggestSlug,
  validateAnswers,
  type Answers,
} from "./onboarding";

function valid(): Answers {
  return {
    owner: { name: "Sam Cole", email: "sam@example.com", phone: "" },
    business: { name: "Sparkle Cleaning", contactEmail: "", contactPhone: "", area: "" },
    address: { slug: "sparkle", customDomain: "" },
    brand: { color: "#0f766e", headerStyle: "light", logoUrl: "", iconUrl: "" },
    services: [{ key: "a", name: "Regular clean", description: "", pricing: "hourly", price: 18, minutes: 120, travelMinutes: 30, walkthrough: false }],
    team: { ownerCleans: true, cleaners: [] },
    hours: { timezone: "Europe/London", days: defaultHours() },
    payments: { method: "unsure", notes: "" },
    notes: "",
  };
}

describe("suggestSlug", () => {
  it("drops company suffixes and punctuation", () => {
    expect(suggestSlug("Acme Cleaning Ltd")).toBe("acme-cleaning");
    expect(suggestSlug("Bob & Sons' Cleaners")).toBe("bob-and-sons-cleaners");
  });

  it("stays within the slug length limit without a trailing hyphen", () => {
    const slug = suggestSlug("A very long cleaning company name that goes on and on forever");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugSchema", () => {
  it("accepts a normal address and lowercases it", () => {
    expect(slugSchema.parse("Sparkle-Clean")).toBe("sparkle-clean");
  });

  it.each(["ab", "-bad", "bad-", "has space", "dou--ble", "admin", "www"])("rejects %s", (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(false);
  });
});

describe("validateAnswers", () => {
  it("accepts a complete set of answers", () => {
    expect(validateAnswers(valid()).ok).toBe(true);
  });

  it("needs someone to do the cleaning", () => {
    const a = valid();
    a.team = { ownerCleans: false, cleaners: [] };
    const result = validateAnswers(a);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/cleaner/i);
  });

  it("rejects a day that finishes before it starts", () => {
    const a = valid();
    a.hours.days = a.hours.days.map((d) => (d.day === 1 ? { ...d, start: "17:00", end: "09:00" } : d));
    const result = validateAnswers(a);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/Monday/);
  });

  it("rejects a bad brand colour and an invalid email", () => {
    const a = valid();
    a.brand.color = "teal";
    a.owner.email = "nope";
    expect(validateAnswers(a).ok).toBe(false);
  });
});

describe("completeness", () => {
  it("reports what is still missing", () => {
    const { done, total, missing } = completeness({ owner: { name: "Sam", email: "sam@example.com" } });
    expect(done).toBe(1);
    expect(total).toBe(7);
    expect(missing).toContain("Services");
  });
});
