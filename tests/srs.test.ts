import { describe, expect, it } from "vitest";
import { NEW_CARD, schedule } from "@/lib/srs";

const now = new Date("2026-10-11T12:00:00Z");
const days = (d: Date) => Math.round((d.getTime() - now.getTime()) / 86_400_000);

describe("schedule", () => {
  it("spaces a remembered card further apart each time", () => {
    const first = schedule(NEW_CARD, "good", now);
    expect([first.intervalDays, days(first.dueAt)]).toEqual([1, 1]);
    const second = schedule(first, "good", now);
    expect(second.intervalDays).toBe(6);
    const third = schedule(second, "good", now);
    expect(third.intervalDays).toBe(15);
    expect(schedule(second, "easy", now).intervalDays).toBeGreaterThan(third.intervalDays);
    expect(schedule(second, "hard", now).intervalDays).toBeLessThan(third.intervalDays);
  });

  it("brings a forgotten card back in minutes and lowers its ease", () => {
    const learned = schedule(schedule(NEW_CARD, "good", now), "good", now);
    const lapsed = schedule(learned, "again", now);
    expect(lapsed).toMatchObject({ reps: 0, lapses: 1, intervalDays: 0 });
    expect(lapsed.ease).toBeCloseTo(2.3);
    expect(lapsed.dueAt.getTime() - now.getTime()).toBe(10 * 60 * 1000);
  });

  it("never lets ease fall below 1.3", () => {
    let state = { ...NEW_CARD };
    for (let i = 0; i < 20; i++) state = schedule(state, "again", now);
    expect(state.ease).toBe(1.3);
  });
});
