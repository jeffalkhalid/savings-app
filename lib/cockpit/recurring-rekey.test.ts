import { describe, it, expect } from "vitest";
import { planRekey } from "./recurring-rekey";

const c = (
  id: string,
  payee_key: string,
  label: string,
  created_at: string
) => ({ id, payee_key, label, expected_amount: 10, created_at });

describe("planRekey", () => {
  it("ne touche pas une charge dont la clé est déjà correcte", () => {
    const plan = planRekey([
      c("1", "retrait dab", "RETRAIT DAB 23/08/25 09H26 CACHAN", "2026-01-01"),
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it("recalcule une clé obsolète", () => {
    const plan = planRekey([
      c(
        "1",
        "prlv sepa wellness training ech id emetteur fr zzz mdt rumwe ref wel gmqbjb g lib",
        "PRLV SEPA WELLNESS TRAINING ECH/020925 ID EMETTEUR/FR80ZZZ509663 MDT/RUMWE543014101 REF/WEL-09-4224131-GMQBJB3G LIB/X",
        "2026-01-01"
      ),
    ]);
    expect(plan.updates).toEqual([{ id: "1", payeeKey: "wellness training" }]);
    expect(plan.deletes).toEqual([]);
  });

  it("fusionne les collisions en gardant la plus récente", () => {
    const plan = planRekey([
      c(
        "vieux",
        "cle-a",
        "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211025 ID EMETTEUR/FR62ZZZ431223 MDT/W1 REF/E2E-1 LIB/X",
        "2026-01-01"
      ),
      c(
        "recent",
        "cle-b",
        "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211125 ID EMETTEUR/FR62ZZZ431223 MDT/W1 REF/E2E-2 LIB/X",
        "2026-02-01"
      ),
    ]);
    expect(plan.updates).toEqual([
      { id: "recent", payeeKey: "foncia val de marne gerance" },
    ]);
    expect(plan.deletes).toEqual(["vieux"]);
  });

  it("est idempotent : rejouer le plan ne change plus rien", () => {
    const already = [
      c(
        "1",
        "foncia val de marne gerance",
        "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211025 ID EMETTEUR/FR62ZZZ431223 MDT/W1 REF/E2E-1 LIB/X",
        "2026-01-01"
      ),
    ];
    const plan = planRekey(already);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it("ignore les charges dont le libellé ne produit aucune clé", () => {
    const plan = planRekey([c("1", "x", "", "2026-01-01")]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });
});
