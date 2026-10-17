import { describe, expect, it } from "vitest";
import { CHECKLIST, CHECKLIST_GROUPS, itemOutcome, type ItemState } from "./checklist-items";

const auto = CHECKLIST.find((i) => i.kind === "auto")!;
const manual = CHECKLIST.find((i) => i.kind === "manual")!;
const state = (patch: Partial<ItemState>): ItemState => ({ done: false, status: null, detail: null, checked_at: null, ...patch });

describe("checklist definition", () => {
  it("has unique keys and only known groups", () => {
    const keys = CHECKLIST.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of CHECKLIST) expect(CHECKLIST_GROUPS).toContain(item.group);
  });

  it("has something to do written for every item", () => {
    for (const item of CHECKLIST) expect(item.todo.length).toBeGreaterThan(10);
  });
});

describe("itemOutcome", () => {
  it("treats an automatic item as unchecked until it has been checked", () => {
    expect(itemOutcome(auto, undefined)).toBe("unchecked");
    expect(itemOutcome(auto, state({}))).toBe("unchecked");
  });

  it("follows the result of an automatic check", () => {
    expect(itemOutcome(auto, state({ status: "pass" }))).toBe("done");
    expect(itemOutcome(auto, state({ status: "fail" }))).toBe("left");
    expect(itemOutcome(auto, state({ status: "unknown" }))).toBe("unknown");
  });

  it("follows the tick on a manual item and ignores any check result", () => {
    expect(itemOutcome(manual, undefined)).toBe("left");
    expect(itemOutcome(manual, state({ done: true }))).toBe("done");
    expect(itemOutcome(manual, state({ done: false, status: "pass" }))).toBe("left");
  });
});
