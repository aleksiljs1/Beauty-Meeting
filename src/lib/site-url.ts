/**
 * Public origin of the site (APP_URL), for absolute URLs in metadata, robots.txt and the
 * sitemap. Reads process.env directly so it also works where src/server/env.ts is not loaded;
 * env.ts still validates APP_URL at server startup.
 */
function resolveSiteUrl(): URL {
  try {
    return new URL(process.env.APP_URL ?? "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const SITE_URL = resolveSiteUrl();

/** Absolute URL for a site path, e.g. siteUrl("/akademia"). */
export function siteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}
