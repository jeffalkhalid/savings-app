import { describe, it, expect } from "vitest";
import { triageQueue, frequentCategories, unsortedIdsFor } from "./triage";
import type { Txn } from "./types";

let seq = 0;
const t = (
  description: string,
  amount: number,
  category_id: string | null = null,
  date = "2026-05-05",
  type: Txn["type"] = "expense"
): Txn => ({
  id: `t${seq++}`,
  date,
  amount,
  description,
  type,
  category_id,
});

const NAMES = new Map([
  ["cat-autres", "Autres"],
  ["cat-courses", "Courses alimentaires"],
  ["cat-resto", "Restaurants & Sorties"],
  ["cat-vir-recus", "Virements reçus"],
  ["cat-vir-emis", "Virements émis"],
  ["cat-frais", "Frais bancaires"],
]);

const queue = (txns: Txn[], ruled: string[] = []) =>
  triageQueue({
    txns,
    categoryNameById: NAMES,
    ruledKeys: new Set(ruled),
  });

describe("triageQueue — ce qui entre dans la file", () => {
  it("retient une ligne sans catégorie", () => {
    const out = queue([t("MONOPRIX PARIS", -20)]);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("monoprix paris");
    expect(out[0].count).toBe(1);
  });

  it("retient une ligne rangée dans le repli « Autres »", () => {
    const out = queue([t("MONOPRIX PARIS", -20, "cat-autres")]);
    expect(out).toHaveLength(1);
  });

  it("retient une ligne dont la catégorie n'existe plus", () => {
    // Une catégorie supprimée laisse un category_id orphelin : la ligne n'est
    // plus classée, même si le champ n'est pas nul.
    const out = queue([t("MONOPRIX PARIS", -20, "cat-disparue")]);
    expect(out).toHaveLength(1);
  });

  it("écarte une ligne rangée dans une vraie catégorie", () => {
    expect(queue([t("MONOPRIX PARIS", -20, "cat-courses")])).toEqual([]);
  });

  it("écarte un commerçant couvert par une règle, même s'il est en Autres", () => {
    // La règle est la mémoire du « j'ai tranché » : c'est ce qui permet de
    // faire taire définitivement un commerçant qui relève vraiment d'Autres.
    const out = queue(
      [t("MONOPRIX PARIS", -20, "cat-autres")],
      ["monoprix paris"]
    );
    expect(out).toEqual([]);
  });

  it("écarte un libellé qui ne produit aucune clé", () => {
    expect(queue([t("", -20)])).toEqual([]);
  });

  it("rend une liste vide pour une entrée vide", () => {
    expect(queue([])).toEqual([]);
  });

  it("écarte une ligne rangée dans une catégorie archivée : connue mais non choisissable", () => {
    // Archiver une catégorie (CategoriesModal) est un affichage, pas une
    // suppression : les lignes gardent leur category_id et restent classées.
    // `categoryNameById` doit donc porter aussi les catégories archivées.
    const names = new Map([...NAMES, ["cat-loisirs", "Loisirs"]]);
    const out = triageQueue({
      txns: [t("MONOPRIX PARIS", -20, "cat-loisirs")],
      categoryNameById: names,
      ruledKeys: new Set(),
      choosableNames: new Set(NAMES.values()),
    });
    expect(out).toEqual([]);
  });

  it("retient une ligne non classée de type revenu, pas seulement les dépenses", () => {
    const out = queue([
      t("SALAIRE ENTREPRISE", 2000, null, "2026-05-05", "income"),
    ]);
    expect(out).toHaveLength(1);
  });
});

describe("triageQueue — ce que porte une entrée", () => {
  it("ne compte que les lignes non classées d'un commerçant partiellement classé", () => {
    const out = queue([
      t("MONOPRIX PARIS", -10, "cat-courses"),
      t("MONOPRIX PARIS", -20, "cat-autres"),
      t("MONOPRIX PARIS", -30, null),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].total).toBeCloseTo(50);
  });

  it("somme en valeur absolue", () => {
    const out = queue([t("REMBOURSEMENT X", 40), t("REMBOURSEMENT X", -10)]);
    expect(out[0].total).toBeCloseTo(50);
  });

  it("rend la période couverte par les lignes non classées", () => {
    const out = queue([
      t("MONOPRIX PARIS", -10, null, "2026-03-02"),
      t("MONOPRIX PARIS", -10, null, "2026-07-19"),
      t("MONOPRIX PARIS", -10, null, "2026-05-05"),
    ]);
    expect(out[0].firstDate).toBe("2026-03-02");
    expect(out[0].lastDate).toBe("2026-07-19");
  });

  it("prend pour libellé le plus fréquent du groupe", () => {
    const out = queue([
      t("MONOPRIX PARIS 14", -10),
      t("MONOPRIX PARIS 14", -10),
      t("MONOPRIX PARIS", -10),
    ]);
    expect(out[0].label).toBe("MONOPRIX PARIS 14");
  });

  it("rend jusqu'à quatre libellés distincts en exemple", () => {
    // Les suffixes sont des CHIFFRES : `normalizePayee` les retire, donc ces
    // six libellés partagent la clé « monoprix ». Avec des lettres, ils
    // formeraient six commerçants distincts.
    const out = queue([
      t("MONOPRIX 1", -10),
      t("MONOPRIX 1", -10),
      t("MONOPRIX 2", -10),
      t("MONOPRIX 3", -10),
      t("MONOPRIX 4", -10),
      t("MONOPRIX 5", -10),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("monoprix");
    expect(out[0].samples).toHaveLength(4);
    expect(new Set(out[0].samples).size).toBe(4);
    // Le plus fréquent d'abord.
    expect(out[0].samples[0]).toBe("MONOPRIX 1");
  });

  it("classe par total non classé décroissant", () => {
    const out = queue([
      t("PETIT COMMERCE", -5),
      t("GROS COMMERCE", -500),
      t("MOYEN COMMERCE", -50),
    ]);
    expect(out.map((m) => m.key)).toEqual([
      "gros commerce",
      "moyen commerce",
      "petit commerce",
    ]);
  });

  it("compte les lignes non classées par type d'opération", () => {
    const out = queue([
      t("SARL DUPONT", -10, null, "2026-05-05", "expense"),
      t("SARL DUPONT", -20, null, "2026-05-05", "expense"),
      t("SARL DUPONT", 30, null, "2026-05-05", "income"),
    ]);
    expect(out[0].typeCounts).toEqual({ expense: 2, income: 1 });
  });
});

describe("triageQueue — la suggestion", () => {
  it("propose la catégorie déjà majoritaire chez ce commerçant", () => {
    const out = queue([
      t("MONOPRIX PARIS", -10, "cat-courses"),
      t("MONOPRIX PARIS", -10, "cat-courses"),
      t("MONOPRIX PARIS", -10, "cat-resto"),
      t("MONOPRIX PARIS", -10, null),
    ]);
    expect(out[0].suggestion).toBe("Courses alimentaires");
  });

  it("ne prend jamais le repli pour une suggestion", () => {
    const out = queue([
      t("MONOPRIX PARIS", -10, "cat-autres"),
      t("MONOPRIX PARIS", -10, "cat-autres"),
      t("MONOPRIX PARIS", -10, "cat-resto"),
    ]);
    expect(out[0].suggestion).toBe("Restaurants & Sorties");
  });

  it("propose Virements reçus pour un virement entrant", () => {
    const out = queue([t("VIREMENT DE PAUL", 120, null)]);
    expect(out[0].suggestion).toBe("Virements reçus");
  });

  it("propose Virements émis pour un virement sortant", () => {
    const out = queue([t("VIR SEPA EMIS /BEN PAUL", -120, null)]);
    expect(out[0].suggestion).toBe("Virements émis");
  });

  it("propose Frais bancaires sur une commission", () => {
    const out = queue([t("COMMISSION INTERVENTION", -8, null)]);
    expect(out[0].suggestion).toBe("Frais bancaires");
  });

  it("ne propose rien sur un commerçant inconnu", () => {
    // Une suggestion inventée serait acceptée d'un tap au vingtième écran.
    expect(queue([t("SARL DUPONT", -42, null)])[0].suggestion).toBeNull();
  });

  it("préfère l'historique au motif de virement", () => {
    const out = queue([
      t("VIREMENT DE PAUL", 120, "cat-resto"),
      t("VIREMENT DE PAUL", 120, null),
    ]);
    expect(out[0].suggestion).toBe("Restaurants & Sorties");
  });

  it("ne propose une catégorie de virement que si elle existe", () => {
    // Un utilisateur peut avoir supprimé ces catégories : ne rien proposer
    // vaut mieux que proposer un nom qui n'ouvrira sur rien.
    const out = triageQueue({
      txns: [t("VIREMENT DE PAUL", 120, null)],
      categoryNameById: new Map([["cat-courses", "Courses alimentaires"]]),
      ruledKeys: new Set(),
    });
    expect(out[0].suggestion).toBeNull();
  });

  it("ne prend pas un libellé qui commence par « Vir » sans être un virement (frontière de mot)", () => {
    // Sans frontière de mot, « Virginie coiffeuse » matchait `^VIR`.
    const out = queue([t("Virginie coiffeuse", -30, null)]);
    expect(out[0].suggestion).toBeNull();
  });

  it("retombe sur le motif de virement quand la suggestion d'historique n'est plus choisissable", () => {
    // La catégorie majoritaire de l'historique est archivée (connue, mais non
    // choisissable) : la suggestion doit essayer la source suivante plutôt
    // que de renoncer tout de suite.
    const names = new Map([...NAMES, ["cat-loisirs", "Loisirs"]]);
    const out = triageQueue({
      txns: [
        t("VIREMENT DE PAUL", 120, "cat-loisirs"),
        t("VIREMENT DE PAUL", 120, null),
      ],
      categoryNameById: names,
      ruledKeys: new Set(),
      choosableNames: new Set(NAMES.values()),
    });
    expect(out[0].suggestion).toBe("Virements reçus");
  });

  it("ne suggère rien quand tout l'historique classé du commerçant est dans le repli", () => {
    const out = queue([
      t("SARL DUPONT", -10, "cat-autres"),
      t("SARL DUPONT", -10, "cat-autres"),
      t("SARL DUPONT", -10, null),
    ]);
    expect(out[0].suggestion).toBeNull();
    // Les lignes en repli sont elles-mêmes non classées : les trois comptent.
    expect(out[0].count).toBe(3);
  });
});

describe("unsortedIdsFor", () => {
  it("rend exactement les ids non classés d'un commerçant qui a des lignes classées et non classées", () => {
    const sorted = t("MONOPRIX PARIS", -10, "cat-courses");
    const unsortedNull = t("MONOPRIX PARIS", -20, null);
    const unsortedFallback = t("MONOPRIX PARIS", -5, "cat-autres");
    const other = t("AUTRE COMMERCE", -1, null);
    const ids = unsortedIdsFor(
      [sorted, unsortedNull, unsortedFallback, other],
      "monoprix paris",
      NAMES
    );
    expect([...ids].sort()).toEqual(
      [unsortedNull.id, unsortedFallback.id].sort()
    );
  });
});

describe("frequentCategories", () => {
  const freq = (txns: Txn[], n: number) =>
    frequentCategories(txns, NAMES, n);

  it("classe par nombre de lignes déjà classées", () => {
    const out = freq(
      [
        t("A", -1, "cat-resto"),
        t("B", -1, "cat-courses"),
        t("C", -1, "cat-courses"),
        t("D", -1, "cat-courses"),
        t("E", -1, "cat-resto"),
        t("F", -1, "cat-frais"),
      ],
      3
    );
    expect(out).toEqual([
      "Courses alimentaires",
      "Restaurants & Sorties",
      "Frais bancaires",
    ]);
  });

  it("respecte n", () => {
    const out = freq(
      [t("A", -1, "cat-resto"), t("B", -1, "cat-courses")],
      1
    );
    expect(out).toHaveLength(1);
  });

  it("exclut le repli", () => {
    const out = freq(
      [
        t("A", -1, "cat-autres"),
        t("B", -1, "cat-autres"),
        t("C", -1, "cat-resto"),
      ],
      5
    );
    expect(out).toEqual(["Restaurants & Sorties"]);
  });

  it("rend une liste vide sur un historique sans rien de classé", () => {
    expect(freq([t("A", -1, null), t("B", -1, "cat-autres")], 5)).toEqual([]);
  });
});
