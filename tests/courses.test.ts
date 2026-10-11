import { describe, expect, it } from "vitest";
import { courses } from "@/lib/courses";

const TIERS = ["free", "preview", "pro"];

describe("course outlines", () => {
  it("have unique slugs", () => {
    expect(new Set(courses.map((c) => c.slug)).size).toBe(courses.length);
  });

  it.each(courses.map((c) => [c.slug, c] as const))("%s is complete", (_slug, course) => {
    expect(course.title).toMatch(/^AP® /);
    expect(course.units.map((u) => u.position)).toEqual(course.units.map((_, i) => i + 1));
    for (const unit of course.units) {
      expect(unit.title.length).toBeGreaterThan(0);
      expect(unit.objectives.length).toBeGreaterThanOrEqual(3);
    }
    for (const tier of Object.values(course.modules)) expect(TIERS).toContain(tier);
  });

  it("keep AP out of new course URLs", () => {
    // ap-biology predates the rule; see README "Rules that apply to all work here".
    const newer = courses.filter((c) => c.slug !== "ap-biology");
    for (const course of newer) expect(course.slug).not.toMatch(/(^|-)ap(-|$)/);
  });
});
