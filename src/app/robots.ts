import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Signed-in areas, single-use links and endpoints: nothing there is meant for search engines
// (those pages also send noindex). /media (public gallery photos) stays crawlable.
const PRIVATE_PREFIXES = ["/admin", "/portal", "/klasa", "/ftese", "/api", "/hyr", "/fjalekalimi"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PREFIXES },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
