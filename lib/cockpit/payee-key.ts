/**
 * Clé de commerçant : identifie un commerçant à travers des libellés bancaires
 * dont une partie change à chaque opération (date, référence SEPA, montant).
 *
 * `normalizePayee` seul ne suffit pas : il ne retire que les chiffres, donc les
 * références alphanumériques survivent et éclatent un même commerçant en autant
 * de clés (Foncia : 9 clés, Wellness Training : 14).
 */
export function normalizePayee(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Motifs essayés dans l'ordre ; le premier qui matche gagne. */
const PATTERNS: RegExp[] = [
  // PRLV SEPA <créancier> ECH/… | ID EMETTEUR…
  /^PRLV\s+SEPA\s+(.+?)\s+(?:ECH\/|ID\s+EMETTEUR)/i,
  // FACTURE CARTE DU <6 chiffres> <commerçant> CARTE …
  /^FACTURE\s+CARTE\s+DU\s+\d{6}\s+(.+?)\s+CARTE\b/i,
  // VIR SEPA [INST] RECU /DE <émetteur> /REF… | /MOTIF…
  /^VIR\s+SEPA\s+(?:INST\s+)?RECU\s*\/?\s*DE\s+(.+?)(?:\s*\/(?:MOTIF|REF)|$)/i,
  // VIR SEPA [INST] EMIS … /BEN <bénéficiaire> /…
  /^VIR\s+SEPA\s+(?:INST\s+)?EMIS\b.*?\/BEN\s+(.+?)(?:\s*\/|$)/i,
  // VIREMENT FAVEUR TIERS <libellé>
  /^VIREMENT\s+FAVEUR\s+TIERS\s+(.+?)(?:\s*\/|$)/i,
  // Famille « VIREMENT … » : libellés saisis à la main ou issus d'anciens
  // imports, qui désignent le même tiers que les libellés SEPA ci-dessus.
  // VIREMENT [INSTANTANE] RECU [DE] <émetteur> [MOTIF…]
  /^VIREMENT\s+(?:INSTANTANE\s+)?RECU\s+(?:DE\s+)?(.+?)(?:\s+MOTIF\b|\s*\/|$)/i,
  // VIREMENT [INSTANTANE] EMIS [A|AU|VERS] <bénéficiaire> [MOTIF…]
  /^VIREMENT\s+(?:INSTANTANE\s+)?EMIS\s+(?:(?:A|AU|VERS)\s+)?(.+?)(?:\s+MOTIF\b|\s+-\s|\s*\/|$)/i,
  // VIREMENT DE <émetteur> [MOTIF…]
  /^VIREMENT\s+DE\s+(.+?)(?:\s+MOTIF\b|\s*\/|$)/i,
  // Vocabulaire de l'export court BNP : « PRELEVEMENT <créancier> DU <date> … »
  // et « PAIEMENT CB <commerçant> DU <date> … », qui désignent les mêmes tiers
  // que les libellés PRLV SEPA / FACTURE CARTE de l'export long.
  /^PRELEVEMENT\s+(.+?)\s+(?:DU\s+\d|ECH\/|ID\s+EMETTEUR)/i,
  /^PAIEMENT\s+CB\s+(.+?)\s+DU\s+\d/i,
];

export function merchantKey(description: string): string {
  const s = String(description ?? "").trim();
  if (!s) return "";
  if (/^RETRAIT\s+(?:DAB|DISTRIBUTEUR)\b/i.test(s)) return "retrait dab";
  for (const re of PATTERNS) {
    const m = s.match(re);
    if (m && m[1]) {
      const key = normalizePayee(m[1]);
      if (key) return key;
    }
  }
  return normalizePayee(s);
}
