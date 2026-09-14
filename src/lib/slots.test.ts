import { describe, expect, it } from "vitest";
import { candidateStartTimes, groupByTimeOfDay } from "./slots";

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

describe("groupByTimeOfDay", () => {
  // Constructed via local-time parts (not UTC ISO strings) since the
  // function buckets by getHours(), which reads the local wall clock.
  const at = (hour: number, minute = 0) => new Date(2026, 0, 5, hour, minute);

  it("buckets into morning/afternoon/evening by local hour", () => {
    const groups = groupByTimeOfDay([at(9), at(11, 30), at(13), at(16, 45), at(18)]);
    expect(groups.map((g) => g.label)).toEqual(["Morning", "Afternoon", "Evening"]);
    expect(groups[0].times).toEqual([at(9), at(11, 30)]);
    expect(groups[1].times).toEqual([at(13), at(16, 45)]);
    expect(groups[2].times).toEqual([at(18)]);
  });

  it("omits empty groups entirely rather than showing them blank", () => {
    const groups = groupByTimeOfDay([at(9), at(10)]);
    expect(groups.map((g) => g.label)).toEqual(["Morning"]);
  });

  it("treats the 12:00 and 17:00 boundaries correctly", () => {
    const groups = groupByTimeOfDay([at(11, 59), at(12, 0), at(16, 59), at(17, 0)]);
    expect(groups[0].times).toEqual([at(11, 59)]);
    expect(groups[1].times).toEqual([at(12, 0), at(16, 59)]);
    expect(groups[2].times).toEqual([at(17, 0)]);
  });
});
