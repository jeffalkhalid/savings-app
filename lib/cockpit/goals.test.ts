import { describe, it, expect } from "vitest";
import {
  goalProgress,
  monthsLeft,
  suggestedMonthly,
  goalsSummary,
  applyContributions,
  type Goal,
} from "./goals";

const g = (over: Partial<Goal>): Goal => ({
  id: "1",
  name: "X",
  icon: "target",
  target_amount: 1000,
  current_amount: 250,
  deadline: null,
  ...over,
});

describe("goalProgress", () => {
  it("computes pct, remaining, done", () => {
    expect(goalProgress(g({}))).toEqual({ pct: 0.25, remaining: 750, done: false });
  });
  it("caps pct at 1 and remaining at 0 when over target", () => {
    const p = goalProgress(g({ current_amount: 1200 }));
    expect(p.pct).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.done).toBe(true);
  });
  it("handles target 0 safely", () => {
    const p = goalProgress(g({ target_amount: 0, current_amount: 0 }));
    expect(p.pct).toBe(0);
    expect(p.done).toBe(false);
  });
});

describe("monthsLeft", () => {
  const today = "2026-06-26";
  it("counts whole months ahead", () => {
    expect(monthsLeft("2026-12-26", today)).toBe(6);
    expect(monthsLeft("2027-06-26", today)).toBe(12);
  });
  it("rounds a partial month up to 1", () => {
    expect(monthsLeft("2026-07-01", today)).toBe(1);
  });
  it("is null when absent or past", () => {
    expect(monthsLeft(null, today)).toBeNull();
    expect(monthsLeft("2026-06-20", today)).toBeNull();
  });
});

describe("suggestedMonthly", () => {
  const today = "2026-06-26";
  it("is remaining / monthsLeft", () => {
    expect(
      suggestedMonthly(
        g({ target_amount: 1200, current_amount: 0, deadline: "2026-12-26" }),
        today
      )
    ).toBe(200);
  });
  it("is null without a deadline or when done", () => {
    expect(suggestedMonthly(g({ deadline: null }), today)).toBeNull();
    expect(
      suggestedMonthly(g({ current_amount: 1000, deadline: "2026-12-26" }), today)
    ).toBeNull();
  });
});

describe("goalsSummary", () => {
  it("sums and computes global pct", () => {
    const s = goalsSummary([
      g({ target_amount: 1000, current_amount: 250 }),
      g({ target_amount: 1000, current_amount: 250 }),
    ]);
    expect(s).toEqual({ totalCurrent: 500, totalTarget: 2000, pct: 0.25 });
  });
  it("empty list yields zeros", () => {
    expect(goalsSummary([])).toEqual({ totalCurrent: 0, totalTarget: 0, pct: 0 });
  });
});

describe("applyContributions", () => {
  it("adds linked contributions to the base current_amount", () => {
    const out = applyContributions(
      [
        { id: "a", name: "A", icon: "target", target_amount: 1000, current_amount: 100, deadline: null },
        { id: "b", name: "B", icon: "target", target_amount: 1000, current_amount: 0, deadline: null },
      ],
      { a: 50 }
    );
    expect(out[0].current_amount).toBe(150);
    expect(out[1].current_amount).toBe(0);
  });
  it("leaves goals unchanged with an empty map", () => {
    const out = applyContributions(
      [{ id: "a", name: "A", icon: "target", target_amount: 1000, current_amount: 100, deadline: null }],
      {}
    );
    expect(out[0].current_amount).toBe(100);
  });
});
