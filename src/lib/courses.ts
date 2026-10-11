import apBiology from "../../courses/ap-biology/course.json";
import calculusAb from "../../courses/calculus-ab/course.json";
import psychology from "../../courses/psychology/course.json";
import usHistory from "../../courses/us-history/course.json";
import type { Tier } from "@/lib/access";

// Course definitions checked into the repo. They seed a course's title,
// outline and module tiers; generated content lives in the database.
export interface CourseConfig {
  slug: string;
  title: string;
  level: string;
  subject: string;
  alignment: string;
  source_mode: "materials_first" | "materials_only";
  modules: Partial<Record<string, Tier>>;
  units: { position: number; title: string; objectives: string[] }[];
}

export const courses: CourseConfig[] = [apBiology, psychology, usHistory, calculusAb] as CourseConfig[];

export function getCourse(slug: string): CourseConfig | undefined {
  return courses.find((c) => c.slug === slug);
}
