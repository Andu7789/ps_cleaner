import { describe, expect, it } from "vitest";
import { canGoToPreviousMonth, getCalendarWeeks, toDateKey } from "./calendar";

describe("toDateKey", () => {
  it("uses local date parts, not UTC", () => {
    // 00:30 on 18 Sept in a UTC+1 (BST-like) reading would be 17 Sept 23:30
    // UTC — toDateKey must still report the 18th, since it's built from
    // getFullYear/getMonth/getDate rather than toISOString().
    const localMidnightThirty = new Date(2026, 8, 18, 0, 30);
    expect(toDateKey(localMidnightThirty)).toBe("2026-09-18");
  });
});

describe("getCalendarWeeks", () => {
  it("starts weeks on Monday and pads with adjacent-month days", () => {
    // September 2026: 1st is a Tuesday.
    const weeks = getCalendarWeeks(new Date(2026, 8, 1), new Date(2026, 8, 10));
    expect(weeks[0].map((d) => d.date.getDate())).toEqual([31, 1, 2, 3, 4, 5, 6]);
    expect(weeks[0][0].inMonth).toBe(false); // 31 Aug
    expect(weeks[0][1].inMonth).toBe(true); // 1 Sept
    const lastWeek = weeks[weeks.length - 1];
    expect(lastWeek).toHaveLength(7);
  });

  it("marks every day from today onward as selectable, with no upper bound", () => {
    const today = new Date(2026, 8, 10);
    const weeks = getCalendarWeeks(today, today);
    const flat = weeks.flat();
    const lastDayOfMonth = flat.filter((d) => d.inMonth).at(-1)!;
    expect(lastDayOfMonth.isSelectable).toBe(true);

    // A date well beyond this month's grid is still selectable — there's
    // no booking-window cutoff (removed on user request; a cleaner's
    // working hours are a recurring weekly pattern with no natural end).
    const farFuture = new Date(2027, 5, 1);
    const futureWeeks = getCalendarWeeks(farFuture, today);
    expect(futureWeeks.flat().find((d) => d.inMonth)!.isSelectable).toBe(true);
  });

  it("marks days before today as not selectable", () => {
    const today = new Date(2026, 8, 10);
    const weeks = getCalendarWeeks(today, today);
    const past = weeks.flat().filter((d) => d.date.getTime() < today.getTime());
    expect(past.every((d) => !d.isSelectable)).toBe(true);
  });

  it("flags exactly one day as today", () => {
    const today = new Date(2026, 8, 10);
    const weeks = getCalendarWeeks(today, today);
    const todays = weeks.flat().filter((d) => d.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].date.getDate()).toBe(10);
  });
});

describe("canGoToPreviousMonth", () => {
  const today = new Date(2026, 8, 20); // 20 Sept 2026

  it("disallows going before the current month", () => {
    expect(canGoToPreviousMonth(new Date(2026, 8, 1), today)).toBe(false);
    expect(canGoToPreviousMonth(new Date(2026, 9, 1), today)).toBe(true);
  });
});
