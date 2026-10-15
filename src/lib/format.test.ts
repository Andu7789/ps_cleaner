import { describe, expect, it } from "vitest";
import { hourlyPricePence } from "./format";

describe("hourlyPricePence", () => {
  it("prorates the hourly rate over the clean time", () => {
    expect(hourlyPricePence(2000, 90)).toBe(3000);
    expect(hourlyPricePence(2000, 30)).toBe(1000);
    expect(hourlyPricePence(2500, 120)).toBe(5000);
  });
  it("rounds to the nearest penny", () => {
    expect(hourlyPricePence(1999, 20)).toBe(666);
  });
  it("is zero for no time or no rate", () => {
    expect(hourlyPricePence(0, 60)).toBe(0);
    expect(hourlyPricePence(2000, 0)).toBe(0);
  });
});
