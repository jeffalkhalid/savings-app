import { describe, it, expect } from "vitest";
import {
  latestValue,
  buildPatrimoineSeries,
  withShares,
  typeLabel,
} from "./patrimoine";
import type { Asset, AssetValuation } from "./patrimoine";

const asset = (id: string, type = "stock"): Asset => ({
  id,
  account_id: null,
  name: id,
  type,
  current_value: 0,
});
const val = (id: string, asset_id: string, date: string, value: number): AssetValuation => ({
  id,
  asset_id,
  date,
  value,
});

describe("latestValue", () => {
  it("returns 0 for an empty list", () => {
    expect(latestValue([])).toBe(0);
  });
  it("returns the value of the most recent date", () => {
    expect(
      latestValue([
        val("v1", "a", "2026-01-01", 100),
        val("v2", "a", "2026-03-01", 300),
        val("v3", "a", "2026-02-01", 200),
      ])
    ).toBe(300);
  });
});

describe("buildPatrimoineSeries", () => {
  it("returns one point per valuation date for a single asset", () => {
    const series = buildPatrimoineSeries(
      [asset("a")],
      [val("v1", "a", "2026-01-01", 100), val("v2", "a", "2026-02-01", 150)]
    );
    expect(series).toEqual([
      { date: "2026-01-01", total: 100 },
      { date: "2026-02-01", total: 150 },
    ]);
  });

  it("carries each asset's latest value forward (step behaviour)", () => {
    const series = buildPatrimoineSeries(
      [asset("a"), asset("b")],
      [
        val("v1", "a", "2026-01-01", 100),
        val("v2", "b", "2026-02-01", 50),
        val("v3", "a", "2026-02-01", 120),
      ]
    );
    expect(series).toEqual([
      { date: "2026-01-01", total: 100 },
      { date: "2026-02-01", total: 170 },
    ]);
  });

  it("ignores valuations belonging to unknown (deleted) assets", () => {
    const series = buildPatrimoineSeries(
      [asset("a")],
      [val("v1", "a", "2026-01-01", 100), val("vx", "ghost", "2026-01-01", 999)]
    );
    expect(series).toEqual([{ date: "2026-01-01", total: 100 }]);
  });

  it("returns an empty array when there are no valuations", () => {
    expect(buildPatrimoineSeries([asset("a")], [])).toEqual([]);
  });
});

describe("withShares", () => {
  it("computes each line's share of the total", () => {
    const rows = withShares([
      { type: "stock", n_assets: 1, total_value: 750 },
      { type: "savings", n_assets: 2, total_value: 250 },
    ]);
    expect(rows[0].share).toBeCloseTo(0.75);
    expect(rows[1].share).toBeCloseTo(0.25);
  });
  it("gives 0 shares when the total is 0", () => {
    const rows = withShares([{ type: "commodity", n_assets: 2, total_value: 0 }]);
    expect(rows[0].share).toBe(0);
  });
});

describe("typeLabel", () => {
  it("maps known types to FR labels", () => {
    expect(typeLabel("stock")).toBe("Actions");
    expect(typeLabel("savings")).toBe("Livrets");
    expect(typeLabel("cash")).toBe("Liquidités");
    expect(typeLabel("commodity")).toBe("Or");
  });
  it("falls back to the raw type when unknown", () => {
    expect(typeLabel("crypto")).toBe("crypto");
  });
});
