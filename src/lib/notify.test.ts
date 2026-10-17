import { describe, expect, it } from "vitest";
import { buildFrom, validReplyTo } from "./notify";

describe("buildFrom", () => {
  it("shows the business name on the shared address", () => {
    expect(buildFrom("bookings@psclean.site", "Acme Cleaning")).toBe('"Acme Cleaning" <bookings@psclean.site>');
  });

  it("copes with the configured value already having a name", () => {
    expect(buildFrom("Old Name <bookings@psclean.site>", "Acme Cleaning")).toBe('"Acme Cleaning" <bookings@psclean.site>');
  });

  it("falls back to the bare address with no name", () => {
    expect(buildFrom("bookings@psclean.site", "")).toBe("bookings@psclean.site");
    expect(buildFrom("bookings@psclean.site", null)).toBe("bookings@psclean.site");
  });

  it("can't be used to inject headers or break out of the name", () => {
    const from = buildFrom("bookings@psclean.site", 'Evil"\r\nBcc: x@y.com <z@z.com>');
    expect(from).not.toMatch(/[\r\n]/);
    expect(from.match(/</g)).toHaveLength(1);
    expect(from.endsWith("<bookings@psclean.site>")).toBe(true);
  });
});

describe("validReplyTo", () => {
  it("accepts a normal address and trims it", () => {
    expect(validReplyTo("  owner@acme.com ")).toBe("owner@acme.com");
  });

  it.each([null, undefined, "", "nope", "a@b", "a@b.com, c@d.com", "Name <a@b.com>"])("rejects %s", (value) => {
    expect(validReplyTo(value)).toBeUndefined();
  });
});
