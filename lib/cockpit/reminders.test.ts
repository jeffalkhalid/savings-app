import { describe, it, expect } from "vitest";
import {
  isDue,
  dueCount,
  activeReminders,
  reminderStatus,
  dueLabel,
  type Reminder,
} from "./reminders";

const r = (over: Partial<Reminder>): Reminder => ({
  id: "1",
  label: "X",
  due_date: "2026-06-26",
  amount: null,
  done: false,
  ...over,
});
const today = "2026-06-26";

describe("isDue", () => {
  it("is due when not done and due_date <= today", () => {
    expect(isDue(r({ due_date: "2026-06-20" }), today)).toBe(true);
    expect(isDue(r({ due_date: "2026-06-26" }), today)).toBe(true);
    expect(isDue(r({ due_date: "2026-07-01" }), today)).toBe(false);
    expect(isDue(r({ due_date: "2026-06-20", done: true }), today)).toBe(false);
  });
});

describe("dueCount", () => {
  it("counts due, not-done reminders", () => {
    expect(
      dueCount(
        [
          r({ due_date: "2026-06-20" }),
          r({ due_date: "2026-07-01" }),
          r({ due_date: "2026-06-26", done: true }),
        ],
        today
      )
    ).toBe(1);
  });
});

describe("activeReminders", () => {
  it("excludes done and sorts by due_date asc", () => {
    const out = activeReminders([
      r({ id: "a", due_date: "2026-07-10" }),
      r({ id: "b", due_date: "2026-06-01" }),
      r({ id: "c", due_date: "2026-06-15", done: true }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("reminderStatus", () => {
  it("classifies overdue/today/upcoming/done", () => {
    expect(reminderStatus(r({ due_date: "2026-06-20" }), today)).toBe("overdue");
    expect(reminderStatus(r({ due_date: "2026-06-26" }), today)).toBe("today");
    expect(reminderStatus(r({ due_date: "2026-07-01" }), today)).toBe("upcoming");
    expect(reminderStatus(r({ done: true }), today)).toBe("done");
  });
});

describe("dueLabel", () => {
  it("formats a relative label", () => {
    expect(dueLabel("2026-06-20", today)).toBe("en retard");
    expect(dueLabel("2026-06-26", today)).toBe("aujourd'hui");
    expect(dueLabel("2026-06-29", today)).toBe("dans 3 j");
  });
});
