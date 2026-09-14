import { describe, expect, it } from "vitest";
import { candidateStartTimes } from "./slots";

describe("candidateStartTimes", () => {
  it("returns evenly stepped slots that fit a duration with no buffer", () => {
    const ranges = [{ free_start: "2026-01-05T09:00:00Z", free_end: "2026-01-05T10:00:00Z" }];
    const starts = candidateStartTimes(ranges, { durationMinutes: 30, stepMinutes: 15 });
    expect(starts.map((d) => d.toISOString())).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-05T09:15:00.000Z",
      "2026-01-05T09:30:00.000Z",
    ]);
  });

  it("reserves room for buffer-before and buffer-after inside the free range", () => {
    const ranges = [{ free_start: "2026-01-05T09:00:00Z", free_end: "2026-01-05T10:00:00Z" }];
    const starts = candidateStartTimes(ranges, {
      durationMinutes: 30,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      stepMinutes: 15,
    });
    // Padded span is duration+30min total; only one slot fits in a 60min range.
    expect(starts.map((d) => d.toISOString())).toEqual(["2026-01-05T09:15:00.000Z"]);
  });

  it("returns nothing when the range is too short for the service", () => {
    const ranges = [{ free_start: "2026-01-05T09:00:00Z", free_end: "2026-01-05T09:20:00Z" }];
    const starts = candidateStartTimes(ranges, { durationMinutes: 30 });
    expect(starts).toEqual([]);
  });

  it("handles multiple disjoint free ranges independently", () => {
    const ranges = [
      { free_start: "2026-01-05T09:00:00Z", free_end: "2026-01-05T09:30:00Z" },
      { free_start: "2026-01-05T13:00:00Z", free_end: "2026-01-05T13:30:00Z" },
    ];
    const starts = candidateStartTimes(ranges, { durationMinutes: 30, stepMinutes: 30 });
    expect(starts.map((d) => d.toISOString())).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-05T13:00:00.000Z",
    ]);
  });
});
