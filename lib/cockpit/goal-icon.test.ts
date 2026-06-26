import { describe, it, expect } from "vitest";
import { goalIcon, GOAL_ICONS } from "./goal-icon";
import { Home, Target } from "lucide-react";

describe("goalIcon", () => {
  it("maps a known key", () => {
    expect(goalIcon("home")).toBe(Home);
  });
  it("falls back to Target", () => {
    expect(goalIcon("zzz")).toBe(Target);
  });
  it("every GOAL_ICONS key resolves to a component", () => {
    expect(GOAL_ICONS.length).toBeGreaterThan(0);
    // lucide-react icons are forwardRef components (objects), not plain functions.
    for (const k of GOAL_ICONS) expect(goalIcon(k)).toBeDefined();
  });
});
