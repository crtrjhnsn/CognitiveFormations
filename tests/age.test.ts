import { describe, expect, it } from "vitest";
import { isAtLeast, parseBirthDate } from "@/lib/age";

const now = new Date("2026-10-11T12:00:00Z");

describe("age screen", () => {
  it("lets people in from their 13th birthday", () => {
    expect(isAtLeast({ year: 2013, month: 10, day: 11 }, 13, now)).toBe(true);
    expect(isAtLeast({ year: 2013, month: 10, day: 12 }, 13, now)).toBe(false);
    expect(isAtLeast({ year: 2013, month: 11, day: 1 }, 13, now)).toBe(false);
    expect(isAtLeast({ year: 2013, month: 9, day: 30 }, 13, now)).toBe(true);
    expect(isAtLeast({ year: 1990, month: 1, day: 1 }, 13, now)).toBe(true);
    expect(isAtLeast({ year: 2020, month: 1, day: 1 }, 13, now)).toBe(false);
  });

  it("rejects dates that don't exist", () => {
    expect(parseBirthDate("2010", "2", "30")).toBeNull();
    expect(parseBirthDate("", "1", "1")).toBeNull();
    expect(parseBirthDate("1850", "1", "1")).toBeNull();
    expect(parseBirthDate("2012", "2", "29")).toEqual({ year: 2012, month: 2, day: 29 });
  });
});
