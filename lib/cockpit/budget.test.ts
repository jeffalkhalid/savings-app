import { describe, it, expect } from "vitest";
import { budgetStatus } from "./budget";

describe("budgetStatus", () => {
  it("is ok below 80%", () => {
    const s = budgetStatus(50, 100);
    expect(s.state).toBe("ok");
    expect(s.pct).toBe(50);
    expect(s.overBy).toBe(0);
  });
  it("is warn between 80% and 100%", () => {
    expect(budgetStatus(90, 100).state).toBe("warn");
  });
  it("is over at/above 100% with pct capped and overBy positive", () => {
    const s = budgetStatus(120, 100);
    expect(s.state).toBe("over");
    expect(s.pct).toBe(100);
    expect(s.overBy).toBe(20);
  });
  it("is none when no/zero budget", () => {
    expect(budgetStatus(50, null).state).toBe("none");
    expect(budgetStatus(50, 0).state).toBe("none");
  });
});
