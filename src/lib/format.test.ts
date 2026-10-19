import { describe, expect, it } from "vitest";
import { estimatePricePence, findWalkthroughService, hourlyPricePence, normaliseReference, quoteAmountDue, servicePriceLabel } from "./format";

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

describe("walkthrough first", () => {
  const svc = (id: string, name: string, extra: Partial<{ is_featured: boolean; walkthrough_first: boolean }> = {}) => ({
    id,
    name,
    is_featured: false,
    walkthrough_first: false,
    ...extra,
  });
  it("shows a from price for a walkthrough first service", () => {
    expect(servicePriceLabel({ price_pence: 15000, requires_quote: false, walkthrough_first: true })).toBe("From £150.00");
  });
  it("sends customers to the featured service", () => {
    const list = [svc("a", "Standard"), svc("b", "Walkthrough", { is_featured: true }), svc("c", "End of Tenancy", { walkthrough_first: true })];
    expect(findWalkthroughService(list)?.id).toBe("b");
  });
  it("falls back to a service named walkthrough and never picks a walkthrough first one", () => {
    expect(findWalkthroughService([svc("a", "Standard"), svc("w", "Free Walk-through")])?.id).toBe("w");
    expect(findWalkthroughService([svc("c", "Walkthrough clean", { walkthrough_first: true })])).toBeNull();
  });
});

describe("servicePriceLabel for hourly services", () => {
  it("shows the hourly rate with per hour", () => {
    expect(servicePriceLabel({ price_pence: 2400, requires_quote: false, hourly_rate_pence: 2400 })).toBe("£24.00 per hour");
  });
  it("adds from when the price starts from", () => {
    expect(
      servicePriceLabel({ price_pence: 2400, requires_quote: false, price_is_from: true, hourly_rate_pence: 2400 })
    ).toBe("From £24.00 per hour");
  });
});

describe("normaliseReference", () => {
  it("strips spaces and dashes and upper cases", () => {
    expect(normaliseReference(" k7qm-2xpa ")).toBe("K7QM2XPA");
    expect(normaliseReference("K7QM 2XPA")).toBe("K7QM2XPA");
  });
});

describe("estimatePricePence", () => {
  it("multiplies the hourly rate by the hours", () => {
    expect(estimatePricePence({ hourly_rate_pence: 3200, price_pence: 3200 }, 3)).toBe(9600);
    expect(estimatePricePence({ hourly_rate_pence: 2400, price_pence: 2400 }, 2.5)).toBe(6000);
  });
  it("needs hours when the clean is hourly", () => {
    expect(estimatePricePence({ hourly_rate_pence: 3200, price_pence: 3200 }, null)).toBeNull();
  });
  it("uses the fixed price when the clean has no hourly rate", () => {
    expect(estimatePricePence({ hourly_rate_pence: null, price_pence: 25000 }, 4)).toBe(25000);
  });
  it("is null without a service", () => {
    expect(estimatePricePence(null, 3)).toBeNull();
  });
});
