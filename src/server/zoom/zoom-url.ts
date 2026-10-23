/** Zoom meeting links (join_url / start_url) — pure, so the checks can be unit-tested. */

const ZOOM_DOMAINS = ["zoom.us", "zoom.com"];

/**
 * True only for an https link on a Zoom domain (e.g. `https://us05web.zoom.us/j/…?pwd=…`).
 * These links are handed to the browser, so anything unexpected in a Zoom response is refused
 * rather than rendered as a link.
 */
export function isZoomMeetingUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return ZOOM_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
