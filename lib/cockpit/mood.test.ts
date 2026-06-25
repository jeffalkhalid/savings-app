import { describe, it, expect } from "vitest";
import { savingsMood } from "./mood";

describe("savingsMood", () => {
  it("is 'good' at or above goal with progress capped at 1", () => {
    const m = savingsMood(0.25, 0.2);
    expect(m.tone).toBe("good");
    expect(m.label).toBe("Au top");
    expect(m.progress).toBe(1);
  });
  it("is 'ok' between half-goal and goal", () => {
    const m = savingsMood(0.12, 0.2);
    expect(m.tone).toBe("ok");
    expect(m.label).toBe("Bien");
  });
  it("is 'watch' below half goal", () => {
    const m = savingsMood(0.04, 0.2);
    expect(m.tone).toBe("watch");
    expect(m.label).toBe("À surveiller");
  });
  it("progress equals taux/goal", () => {
    expect(savingsMood(0.1, 0.2).progress).toBeCloseTo(0.5);
  });
  it("goal 0 yields progress 0", () => {
    expect(savingsMood(0.1, 0).progress).toBe(0);
  });
});
