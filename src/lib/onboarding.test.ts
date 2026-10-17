import { describe, expect, it } from "vitest";
import {
  completeness,
  countBySection,
  findIssues,
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

describe("optional answers", () => {
  // The form saves without its empty fields, and the server checks what was saved.
  function withoutBlanks(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(withoutBlanks);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).filter(([, v]) => v !== "").map(([k, v]) => [k, withoutBlanks(v)]),
      );
    }
    return value;
  }

  it("accepts saved answers with every optional field left blank", () => {
    const result = validateAnswers(withoutBlanks(valid()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.owner.phone).toBe("");
      expect(result.data.business.area).toBe("");
      expect(result.data.address.customDomain).toBe("");
      expect(result.data.brand.logoUrl).toBe("");
    }
  });

  it("still asks for the things that really are required", () => {
    const a = withoutBlanks({ ...valid(), owner: { name: "", email: "", phone: "" } });
    expect(findIssues(a).filter((i) => i.section === "owner").length).toBeGreaterThan(0);
  });
});

describe("findIssues", () => {
  it("finds nothing wrong with complete answers", () => {
    expect(findIssues(valid())).toEqual([]);
  });

  it("files each problem under the section it belongs to", () => {
    const a = valid();
    a.owner.name = "";
    a.owner.email = "nope";
    a.business.name = "";
    a.services = [{ ...a.services[0], name: "" }, { ...a.services[0], key: "b", name: "" }];
    a.team = { ownerCleans: false, cleaners: [] };
    const by = countBySection(findIssues(a));
    expect(by.owner).toHaveLength(2);
    expect(by.business).toHaveLength(1);
    expect(by.services.map((i) => i.message)).toEqual(
      expect.arrayContaining([expect.stringContaining("Service 1:"), expect.stringContaining("Service 2:")]),
    );
    expect(by.team).toHaveLength(1);
    expect(by.address).toHaveLength(0);
    expect(by.brand).toHaveLength(0);
  });

  it("counts an empty form's problems rather than erroring", () => {
    const a = valid();
    a.address.slug = "";
    a.hours.days = a.hours.days.map((d) => ({ ...d, on: false }));
    const by = countBySection(findIssues(a));
    expect(by.address).toHaveLength(1);
    expect(by.team.map((i) => i.message)).toContain("Pick at least one working day.");
  });
});
