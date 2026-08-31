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
