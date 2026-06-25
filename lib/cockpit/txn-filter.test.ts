import { describe, it, expect } from "vitest";
import { filterTxns } from "./txn-filter";
import type { Txn } from "./types";

const t = (over: Partial<Txn>): Txn => ({
  id: "1",
  date: "2026-06-01",
  amount: -10,
  description: "X",
  type: "expense",
  category_id: "a",
  ...over,
});
const txns: Txn[] = [
  t({ id: "1", description: "Carrefour Market", category_id: "a" }),
  t({ id: "2", description: "Café de la gare", category_id: "b" }),
  t({ id: "3", description: "CARREFOUR City", category_id: "a" }),
];

describe("filterTxns", () => {
  it("matches description case- and accent-insensitively", () => {
    expect(filterTxns(txns, "carre").map((x) => x.id)).toEqual(["1", "3"]);
    expect(filterTxns(txns, "café").map((x) => x.id)).toEqual(["2"]);
    expect(filterTxns(txns, "cafe").map((x) => x.id)).toEqual(["2"]);
  });
  it("filters by category when provided", () => {
    expect(filterTxns(txns, "", "b").map((x) => x.id)).toEqual(["2"]);
  });
  it("empty query and no category returns all", () => {
    expect(filterTxns(txns, "")).toHaveLength(3);
  });
  it("treats 'all' or null as no category filter", () => {
    expect(filterTxns(txns, "", "all")).toHaveLength(3);
    expect(filterTxns(txns, "", null)).toHaveLength(3);
  });
});
