import { describe, it, expect } from "vitest";
import { allocationRows, targetsTotal } from "./allocation";
import type { PatrimoineLine } from "./patrimoine";

const lines: PatrimoineLine[] = [
  { type: "stock", n_assets: 2, total_value: 6000 },
  { type: "savings", n_assets: 1, total_value: 4000 },
];

describe("allocationRows", () => {
  it("computes realPct from lines and delta vs target", () => {
    const rows = allocationRows(lines, { stock: 50, savings: 30 });
    const stock = rows.find((r) => r.type === "stock")!;
    expect(stock.realPct).toBe(60);
    expect(stock.targetPct).toBe(50);
    expect(stock.delta).toBe(10);
  });
  it("includes a target type with no holdings", () => {
    const rows = allocationRows(lines, { commodity: 20 });
    const c = rows.find((r) => r.type === "commodity")!;
    expect(c.realPct).toBe(0);
    expect(c.targetPct).toBe(20);
    expect(c.delta).toBe(-20);
  });
  it("leaves target/delta null for a holding without target", () => {
    const rows = allocationRows(lines, {});
    const stock = rows.find((r) => r.type === "stock")!;
    expect(stock.targetPct).toBeNull();
    expect(stock.delta).toBeNull();
  });
  it("handles a zero total without dividing by zero", () => {
    const rows = allocationRows(
      [{ type: "stock", n_assets: 0, total_value: 0 }],
      { stock: 50 }
    );
    expect(rows[0].realPct).toBe(0);
  });
});

describe("targetsTotal", () => {
  it("sums positive targets", () => {
    expect(targetsTotal({ stock: 50, savings: 30, cash: 0 })).toBe(80);
  });
});
