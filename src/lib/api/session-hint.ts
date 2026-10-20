import "client-only";

/**
 * Non-secret "probably signed in" hint, readable by JavaScript. It only decides whether
 * components such as the live-class alert should try to talk to the API at all, so anonymous
 * visitors of public pages trigger no auth requests. It grants nothing: the real credential
 * is the HttpOnly session cookie and every request is still authorized server-side.
 */
export const SESSION_HINT_COOKIE = "academy_signed_in";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // matches the session lifetime

function secureFlag() {
  return typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
}

export function setSessionHint() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_HINT_COOKIE}=1; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secureFlag()}`;
}

export function clearSessionHint() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secureFlag()}`;
}

export function hasSessionHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim() === `${SESSION_HINT_COOKIE}=1`);
}
