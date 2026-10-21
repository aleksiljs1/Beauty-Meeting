/**
 * Validates the `next` redirect parameter of the login page. Only same-origin relative paths
 * are accepted ("/portal", "/ftese/abc?x=1"); anything that could leave the site
 * ("//evil.com", "/\\evil.com", "https://…", "javascript:…") or is malformed returns null.
 * Pure: shared by the login Server Component and the login form.
 */
const MAX_LENGTH = 512;

export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length < 1 || value.length > MAX_LENGTH) return null;
  // Exactly one leading slash; browsers treat "\" like "/" so "/\" is protocol-relative too.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.includes("\\")) return null;
  // Control characters (incl. tab/newline, which browsers strip) are never legitimate here.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  try {
    const base = "http://same.origin";
    const url = new URL(value, base);
    if (url.origin !== base) return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Re-check after normalization: "/.//evil.com" or "/%2e//evil.com" collapse to "//evil.com".
    if (path.startsWith("//") || path.startsWith("/\\")) return null;
    return path;
  } catch {
    return null;
  }
}

/** Where to send a user after login: a valid `next` for their area, else their home. */
export function postLoginDestination(role: "admin" | "student", next: unknown): string {
  const home = role === "admin" ? "/admin" : "/portal";
  const path = safeNextPath(next);
  if (!path) return home;
  // Don't bounce people into the other role's area (the page would just redirect again).
  if (role === "student" && (path === "/admin" || path.startsWith("/admin/"))) return home;
  if (role === "admin" && (path === "/portal" || path.startsWith("/portal/"))) return home;
  // Never return to the auth pages themselves.
  if (path === "/hyr" || path.startsWith("/hyr?") || path.startsWith("/fjalekalimi")) return home;
  return path;
}
