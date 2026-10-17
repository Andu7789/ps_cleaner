import { describe, expect, it } from "vitest";
import { NOT_READY_MESSAGE, accountIsReady, routingFor } from "./stripe-connect";

describe("routingFor", () => {
  it("adds nothing for a business paid on the platform account", () => {
    expect(
      routingFor({ payment_mode: "platform", stripe_connect_account_id: null, stripe_charges_enabled: false }),
    ).toEqual({});
  });

  it("ignores a connected account while the business is in platform mode", () => {
    expect(
      routingFor({ payment_mode: "platform", stripe_connect_account_id: "acct_1", stripe_charges_enabled: true }),
    ).toEqual({});
  });

  it("sends the money on to a ready connected account, with no fee", () => {
    const routing = routingFor({ payment_mode: "connect", stripe_connect_account_id: "acct_1", stripe_charges_enabled: true });
    expect(routing).toEqual({ transfer_data: { destination: "acct_1" } });
  });

  it("refuses to take a card payment until the owner has finished Stripe setup", () => {
    expect(() =>
      routingFor({ payment_mode: "connect", stripe_connect_account_id: "acct_1", stripe_charges_enabled: false }),
    ).toThrow(NOT_READY_MESSAGE);
    expect(() =>
      routingFor({ payment_mode: "connect", stripe_connect_account_id: null, stripe_charges_enabled: true }),
    ).toThrow(NOT_READY_MESSAGE);
  });
});

describe("accountIsReady", () => {
  it("needs both charges enabled and details submitted", () => {
    expect(accountIsReady({ charges_enabled: true, details_submitted: true })).toBe(true);
    expect(accountIsReady({ charges_enabled: true, details_submitted: false })).toBe(false);
    expect(accountIsReady({ charges_enabled: false, details_submitted: true })).toBe(false);
  });
});
