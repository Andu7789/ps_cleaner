import { describe, expect, it } from "vitest";
import { hourlyPricePence, quoteAmountDue, servicePriceLabel } from "./format";

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

describe("servicePriceLabel", () => {
  it("shows a plain price by default", () => {
    expect(servicePriceLabel({ price_pence: 6000, requires_quote: false })).toBe("£60.00");
  });
  it("shows from when pricing starts from is on", () => {
    expect(servicePriceLabel({ price_pence: 6000, requires_quote: false, price_is_from: true })).toBe("From £60.00");
  });
  it("still reads Free for a zero price", () => {
    expect(servicePriceLabel({ price_pence: 0, requires_quote: false, price_is_from: true })).toBe("Free");
  });
});

describe("quoteAmountDue", () => {
  it("is the full price less what is paid once a quote is confirmed", () => {
    expect(quoteAmountDue({ quote_status: "quoted", price_pence: 20500, amount_paid_pence: 0 })).toBe(20500);
    expect(quoteAmountDue({ quote_status: "quoted", price_pence: 20500, amount_paid_pence: 5000 })).toBe(15500);
  });
  it("is zero before the quote is confirmed", () => {
    expect(quoteAmountDue({ quote_status: "pending", price_pence: 20500, amount_paid_pence: 0 })).toBe(0);
  });
});
