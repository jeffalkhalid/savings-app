import { describe, it, expect } from "vitest";
import { pendingTransfers } from "./transfers";
import type { Txn } from "./types";

const t = (type: Txn["type"], date: string): Txn => ({
  id: type + date,
  date,
  amount: -100,
  description: type,
  type,
});

describe("pendingTransfers", () => {
  it("keeps only transfer transactions", () => {
    const out = pendingTransfers([
      t("transfer", "2026-05-02"),
      t("expense", "2026-05-03"),
      t("income", "2026-05-04"),
      t("savings", "2026-05-05"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("transfer");
  });
  it("sorts by date descending", () => {
    const out = pendingTransfers([
      t("transfer", "2026-05-02"),
      t("transfer", "2026-05-10"),
      t("transfer", "2026-05-05"),
    ]);
    expect(out.map((x) => x.date)).toEqual([
      "2026-05-10",
      "2026-05-05",
      "2026-05-02",
    ]);
  });
  it("returns [] when there are no transfers", () => {
    expect(pendingTransfers([t("expense", "2026-05-01")])).toEqual([]);
  });
});
