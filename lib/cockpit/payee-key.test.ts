import { describe, it, expect } from "vitest";
import { merchantKey, normalizePayee } from "./payee-key";

describe("normalizePayee (comportement historique préservé)", () => {
  it("minuscule, retire accents, chiffres et ponctuation", () => {
    expect(normalizePayee("CARREFOUR Banque 123-456")).toBe("carrefour banque");
    expect(normalizePayee("Éléctricité")).toBe("electricite");
  });
  it("tolère null et vide", () => {
    expect(normalizePayee("")).toBe("");
    expect(normalizePayee(undefined as unknown as string)).toBe("");
  });
});

describe("merchantKey — prélèvements SEPA", () => {
  it("extrait le créancier avant ECH/", () => {
    expect(
      merchantKey(
        "PRLV SEPA CARREFOUR BANQUE ECH/080825 ID EMETTEUR/FR83ZZZ135674 MDT/CS00-51272097231100 REF/CBSDD20250806000000000000272063PS2P LIB/51272097231100PRLV COMPTANT IMMEDIAT"
      )
    ).toBe("carrefour banque");
  });

  it("donne UNE seule clé aux variantes Foncia (9 clés auparavant)", () => {
    const a =
      "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211025 ID EMETTEUR/FR62ZZZ431223 MDT/W0202008046914587987906 REF/E2E-68F235C5CC8CB6B85DA36626 LIB/PRELEVEMENT LOYER FONCIA";
    const b =
      "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211125 ID EMETTEUR/FR62ZZZ431223 MDT/W0202008046914587987906 REF/E2E-99A111B2CC3DD4E55FA66777 LIB/PRELEVEMENT LOYER FONCIA";
    expect(merchantKey(a)).toBe("foncia val de marne gerance");
    expect(merchantKey(a)).toBe(merchantKey(b));
  });

  it("donne UNE seule clé aux variantes Wellness Training (14 clés auparavant)", () => {
    const a =
      "PRLV SEPA WELLNESS TRAINING ECH/020925 ID EMETTEUR/FR80ZZZ509663 MDT/RUMWE543014101 REF/WEL-09-4224131-GMQBJB3G LIB/WELLNESS TRAINING CARREFOUR MASSY - WEL-09-4224131-GMQBJB3G";
    const b =
      "PRLV SEPA WELLNESS TRAINING ECH/021025 ID EMETTEUR/FR80ZZZ509663 MDT/RUMWE543014101 REF/WEL-10-4224131-VPAXL7WK LIB/WELLNESS TRAINING CARREFOUR MASSY - WEL-10-4224131-VPAXL7WK";
    expect(merchantKey(a)).toBe("wellness training");
    expect(merchantKey(a)).toBe(merchantKey(b));
  });
});

describe("merchantKey — paiements carte", () => {
  it("extrait le commerçant entre la date et CARTE", () => {
    expect(
      merchantKey(
        "FACTURE CARTE DU 050825 ELIOR ENTRETRIS CARTE   4974XXXXXXXX4402                FRA    20,00EUR"
      )
    ).toBe("elior entretris");
  });

  it("ignore la date et le montant, qui varient", () => {
    const a =
      "FACTURE CARTE DU 131025 CAMPUS CARREFOU CARTE   4974XXXXXXXX4402                FRA    80,00EUR";
    const b =
      "FACTURE CARTE DU 021125 CAMPUS CARREFOU CARTE   4974XXXXXXXX4402                FRA    12,50EUR";
    expect(merchantKey(a)).toBe("campus carrefou");
    expect(merchantKey(a)).toBe(merchantKey(b));
  });
});

describe("merchantKey — virements", () => {
  it("extrait l'émetteur d'un virement reçu", () => {
    expect(
      merchantKey(
        "VIR SEPA RECU /DE CARREFOUR FRANCE /MOTIF  /REF CARREFOUR 1961870275237171845034602"
      )
    ).toBe("carrefour france");
  });

  it("extrait l'émetteur d'un virement instantané reçu", () => {
    expect(
      merchantKey(
        "VIR SEPA INST RECU /DE MLLE YASMINE JEFFAL /REF 032025273685917520000001 /MOTIF REMBOURSEMENT"
      )
    ).toBe("mlle yasmine jeffal");
  });

  it("extrait le bénéficiaire d'un virement émis", () => {
    expect(
      merchantKey(
        "VIR SEPA INST EMIS /MOTIF MONTENEGRO /BEN KHALID REVOLUT /REFDO 2EF3099DF17C4DBD8A0B29B1786A412B /REFBEN NOTPROVIDED"
      )
    ).toBe("khalid revolut");
  });

  it("extrait le libellé d'un virement permanent", () => {
    expect(merchantKey("VIREMENT FAVEUR TIERS VR.PERMANENT LOYER 31 RUE CAMILLE DESMOULIN")).toBe(
      "vr permanent loyer rue camille desmoulin"
    );
  });
});

describe("merchantKey — autres opérations", () => {
  it("regroupe tous les retraits DAB", () => {
    const a =
      "RETRAIT DAB 23/08/25 09H26 17877A00 2SF SOCIETE DES SERV      CACHAN           0004974XXXXXXXX4402";
    const b =
      "RETRAIT DAB 02/09/25 18H03 44120B01 AUTRE BANQUE             PARIS            0004974XXXXXXXX4402";
    expect(merchantKey(a)).toBe("retrait dab");
    expect(merchantKey(a)).toBe(merchantKey(b));
  });

  it("retombe sur normalizePayee quand aucun motif ne matche", () => {
    expect(
      merchantKey("COMMISSIONS COTISATION A UNE OFFRE GROUPEE DE SERVICES ESPRIT LIBRE")
    ).toBe("commissions cotisation a une offre groupee de services esprit libre");
  });

  it("tolère vide et null", () => {
    expect(merchantKey("")).toBe("");
    expect(merchantKey(null as unknown as string)).toBe("");
  });
});

describe("merchantKey — famille VIREMENT (saisie manuelle / anciens imports)", () => {
  it("extrait l'émetteur d'un « VIREMENT DE … MOTIF »", () => {
    expect(merchantKey("VIREMENT DE CARREFOUR FRANCE MOTIF: SALAIRE")).toBe(
      "carrefour france"
    );
  });

  it("extrait l'émetteur d'un « VIREMENT INSTANTANE RECU DE … »", () => {
    expect(
      merchantKey("VIREMENT INSTANTANE RECU DE MME YASMINE JEFFAL")
    ).toBe("mme yasmine jeffal");
  });

  it("extrait l'émetteur d'un « VIREMENT RECU DE … »", () => {
    expect(merchantKey("VIREMENT RECU DE CARREFOUR FRANCE")).toBe(
      "carrefour france"
    );
  });

  it("extrait le bénéficiaire d'un « VIREMENT INSTANTANE EMIS … »", () => {
    expect(
      merchantKey("VIREMENT INSTANTANE EMIS A KHALID REVOLUT MOTIF: X")
    ).toBe("khalid revolut");
  });

  it("converge avec le format SEPA du même payeur", () => {
    const sepa = merchantKey(
      "VIR SEPA RECU /DE CARREFOUR FRANCE /MOTIF  /REF CARREFOUR 196187027523717"
    );
    const manuel = merchantKey("VIREMENT DE CARREFOUR FRANCE MOTIF: SALAIRE");
    expect(manuel).toBe(sepa);
  });

  it("converge aussi pour un virement instantané reçu", () => {
    const sepa = merchantKey(
      "VIR SEPA INST RECU /DE MME YASMINE JEFFAL /REF X /MOTIF Y"
    );
    const manuel = merchantKey("VIREMENT INSTANTANE RECU DE MME YASMINE JEFFAL");
    expect(manuel).toBe(sepa);
  });

  it("ne casse pas VIREMENT FAVEUR TIERS", () => {
    expect(
      merchantKey("VIREMENT FAVEUR TIERS VR.PERMANENT LOYER 31 RUE CAMILLE DESMOULIN")
    ).toBe("vr permanent loyer rue camille desmoulin");
  });
});

describe("merchantKey — vocabulaire de l'export court BNP", () => {
  it("extrait le créancier d'un « PRELEVEMENT … DU <date> »", () => {
    expect(
      merchantKey(
        "PRELEVEMENT FONCIA VAL DE MARNE GERANCE DU 07/08/26 - EMETTEUR : FR62ZZZ431223 MDT - MOTIF : PRELEVEMENT LOYER FONCIA - REF : E2E-6A63AAA0A24A0EDF3CD296EE LIB"
      )
    ).toBe("foncia val de marne gerance");
  });

  it("converge avec le format SEPA du même créancier", () => {
    const court = merchantKey(
      "PRELEVEMENT FONCIA VAL DE MARNE GERANCE DU 07/08/26 - EMETTEUR : FR62ZZZ431223 MDT - MOTIF : X - REF : Y"
    );
    const long = merchantKey(
      "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211025 ID EMETTEUR/FR62ZZZ431223 MDT/W02 REF/E2E-68F LIB/PRELEVEMENT LOYER FONCIA"
    );
    expect(court).toBe(long);
    expect(court).toBe("foncia val de marne gerance");
  });

  it("donne une clé stable aux prélèvements Bouygues de mois différents", () => {
    const a = merchantKey(
      "PRELEVEMENT BOUYGUES TELECOM DU 14/08/26 - EMETTEUR : FR35ZZZ418323 MDT - MOTIF : 07XXXXX886 - REF : PAGP0110GIAWHN LIB"
    );
    const b = merchantKey(
      "PRELEVEMENT BOUYGUES TELECOM DU 14/09/26 - EMETTEUR : FR35ZZZ418323 MDT - MOTIF : 07XXXXX886 - REF : ZQRT9987KLMNOP LIB"
    );
    expect(a).toBe("bouygues telecom");
    expect(a).toBe(b);
  });

  it("extrait le commerçant d'un « PAIEMENT CB … DU <date> »", () => {
    expect(
      merchantKey("PAIEMENT CB ELIOR (FRANCE) DU 28/08/26 - CARTE*4402")
    ).toBe("elior france");
  });

  it("regroupe les retraits, quel que soit le vocabulaire", () => {
    const court = merchantKey(
      "RETRAIT DISTRIBUTEUR 2SF SOCIETE DES SERV DU 31/05/26 08H49 A CACHAN - CARTE*4402"
    );
    const long = merchantKey(
      "RETRAIT DAB 23/08/25 09H26 17877A00 2SF SOCIETE DES SERV      CACHAN           0004974XXXXXXXX4402"
    );
    expect(court).toBe("retrait dab");
    expect(court).toBe(long);
  });

  it("ne confond pas un bénéficiaire commençant par A avec le mot « A »", () => {
    expect(merchantKey("VIREMENT INSTANTANE EMIS ALICE MARTIN")).toBe("alice martin");
  });

  it("converge sur le virement instantané émis des deux formats", () => {
    const court = merchantKey(
      "VIREMENT INSTANTANE EMIS VERS KHALID JEFFAL - MOTIF : EPARGNE"
    );
    expect(court).toBe("khalid jeffal");
  });
});

describe("merchantKey — variante hybride PRELEVEMENT + ECH/", () => {
  it("converge avec les deux autres formats du même créancier", () => {
    const hybride = merchantKey(
      "PRELEVEMENT CARREFOUR BANQUE ECH/210826 ID EMETTEUR/FR83ZZZ135674 MDT/CS00-51272097231100 REF/CBSDD2026081900000"
    );
    const court = merchantKey(
      "PRELEVEMENT CARREFOUR BANQUE DU 27/08/26 - EMETTEUR : FR83ZZZ135674 MDT - MOTIF : X - REF : Y"
    );
    const long = merchantKey(
      "PRLV SEPA CARREFOUR BANQUE ECH/080825 ID EMETTEUR/FR83ZZZ135674 MDT/CS00-51 REF/CBSDD LIB/Z"
    );
    expect(hybride).toBe("carrefour banque");
    expect(hybride).toBe(court);
    expect(hybride).toBe(long);
  });
});
