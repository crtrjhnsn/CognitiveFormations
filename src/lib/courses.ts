import apBiology from "../../courses/ap-biology/course.json";

// Course definitions checked into the repo. Generated content lives in the
// database; these only seed titles, outline and module tiers.
export interface CourseConfig {
  slug: string;
  title: string;
  level: string;
  subject: string;
  alignment: string;
  units: { position: number; title: string; objectives: string[] }[];
}

export const courses: CourseConfig[] = [apBiology];

export function getCourse(slug: string): CourseConfig | undefined {
  return courses.find((c) => c.slug === slug);
}
