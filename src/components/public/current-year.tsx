"use client";

/**
 * The year for the footer's ©. Public pages are pre-rendered, so a year computed on the server
 * stays the one of the last build; the browser shows today's.
 */
export function CurrentYear() {
  return <span suppressHydrationWarning>{new Date().getFullYear()}</span>;
}
