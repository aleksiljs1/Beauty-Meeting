import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
import { getPublicCourses } from "@/server/queries/public";

type Entry = MetadataRoute.Sitemap[number];

const STATIC_PAGES: Array<{ path: string; changeFrequency: Entry["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/sherbimet", changeFrequency: "monthly", priority: 0.9 },
  { path: "/akademia", changeFrequency: "weekly", priority: 0.9 },
  { path: "/galeria", changeFrequency: "weekly", priority: 0.7 },
  { path: "/rreth-nesh", changeFrequency: "monthly", priority: 0.7 },
  { path: "/kontakt", changeFrequency: "monthly", priority: 0.8 },
  { path: "/privatesia", changeFrequency: "yearly", priority: 0.2 },
  { path: "/kushtet", changeFrequency: "yearly", priority: 0.2 },
];

// Regenerated together with the public pages: admin content changes revalidate the whole tree.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = STATIC_PAGES.map(({ path, changeFrequency, priority }) => ({
    url: siteUrl(path),
    changeFrequency,
    priority,
  }));

  let courses: Awaited<ReturnType<typeof getPublicCourses>> = [];
  try {
    courses = await getPublicCourses();
  } catch (error) {
    // The static pages are still worth serving if the database is briefly unavailable.
    console.error("sitemap: could not load public courses", error);
  }

  return [
    ...pages,
    ...courses.map((course) => ({
      url: siteUrl(`/akademia/${encodeURIComponent(course.slug)}`),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
