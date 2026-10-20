/** Pure timing helpers for the notification poller and the recording player. */

export const POLL_INTERVAL_MS = 20_000;
export const MAX_BACKOFF_MS = 2 * 60_000;

/**
 * Delay before the next poll. Healthy: the regular interval. After consecutive failures:
 * exponential backoff (20 s, 40 s, 80 s, …) capped at 2 minutes, with up to 10 % jitter so
 * many tabs don't retry in lockstep. `random` is injectable for tests.
 */
export function nextPollDelay(consecutiveFailures: number, random: () => number = Math.random): number {
  if (consecutiveFailures <= 0) return POLL_INTERVAL_MS;
  const exponent = Math.min(consecutiveFailures, 10);
  const base = Math.min(MAX_BACKOFF_MS, POLL_INTERVAL_MS * 2 ** exponent);
  const jitter = base * 0.1 * random();
  return Math.min(MAX_BACKOFF_MS, Math.round(base - jitter));
}

/**
 * When to renew a short-lived playback URL: 30 s before it expires (or at 80 % of its
 * lifetime for short grants), never sooner than 5 s to avoid tight loops near a deadline.
 */
export function grantRenewDelayMs(expiresInSeconds: number): number {
  const lifetimeMs = Math.max(0, expiresInSeconds) * 1000;
  const early = Math.min(30_000, lifetimeMs * 0.2);
  return Math.max(5_000, Math.round(lifetimeMs - early));
}

/** Seconds → "2 orë 05 min" / "14 min 03 s" / "45 s" for the countdown display. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days} ditë ${hours} orë`;
  if (hours > 0) return `${hours} orë ${pad(minutes)} min`;
  if (minutes > 0) return `${minutes} min ${pad(seconds)} s`;
  return `${seconds} s`;
}
