import { describe, it, expect } from "vitest";
import { buildNotes } from "./cockpit-notes";
import type { CategoryInsight } from "./categories-analysis";
import type { Mood } from "./mood";

const mood: Mood = { label: "Bien", progress: 0.6, tone: "ok" };
const mk = (over: Partial<CategoryInsight>): CategoryInsight => ({
  categoryId: "x",
  name: "X",
  total: 100,
  nTxns: 1,
  share: 0.3,
  avgPrior: 0,
  deltaPct: null,
  ...over,
});

describe("buildNotes", () => {
  it("always includes the savings status card first", () => {
    const notes = buildNotes([], mood);
    expect(notes).toHaveLength(1);
    expect(notes[0].kind).toBe("status");
    expect(notes[0].title).toBe("Bien");
    expect(notes[0].tone).toBe("ok");
  });
  it("adds a rise card for the biggest increase", () => {
    const notes = buildNotes(
      [
        mk({ categoryId: "a", name: "Resto", share: 0.2, deltaPct: 0.4 }),
        mk({ categoryId: "b", name: "Courses", share: 0.5, deltaPct: 0.1 }),
      ],
      mood
    );
    const rise = notes.find((n) => n.kind === "rise");
    expect(rise?.title).toBe("Resto");
    expect(rise?.body).toContain("+40%");
  });
  it("adds a dominant-category card", () => {
    const notes = buildNotes(
      [mk({ categoryId: "b", name: "Courses", share: 0.5, deltaPct: null })],
      mood
    );
    const dom = notes.find((n) => n.kind === "dominant");
    expect(dom?.title).toBe("Courses");
    expect(dom?.body).toContain("50%");
  });
  it("dedupes when the riser is also the dominant category", () => {
    const notes = buildNotes(
      [mk({ categoryId: "b", name: "Courses", share: 0.6, deltaPct: 0.3 })],
      mood
    );
    expect(notes.filter((n) => n.title === "Courses")).toHaveLength(1);
    expect(notes.length).toBeLessThanOrEqual(3);
  });
});
