import { describe, it, expect } from "vitest";
import { pageRanges } from "./paging";

describe("pageRanges", () => {
  it("découpe en plages inclusives, comme Supabase les attend", () => {
    expect(pageRanges(2500, 1000)).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2499 },
    ]);
  });

  it("rend une seule plage quand tout tient dedans", () => {
    expect(pageRanges(10, 1000)).toEqual([{ from: 0, to: 9 }]);
  });

  it("gère un total exactement multiple de la taille de page", () => {
    expect(pageRanges(2000, 1000)).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ]);
  });

  it("rend une liste vide pour un total nul", () => {
    expect(pageRanges(0, 1000)).toEqual([]);
  });
});
