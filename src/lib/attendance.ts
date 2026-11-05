/**
 * Attendance arithmetic for one person in one lesson: their stays (join → leave) merged where
 * they overlap (e.g. joined on the phone before the laptop dropped), added up. Pure — unit-tested.
 */

export type Stay = { joinedAt: Date; leftAt: Date | null };

export type AttendanceSummary = {
  /** Time actually in the class, overlaps counted once. */
  minutes: number;
  /** How many times they came in. */
  joins: number;
  firstJoinedAt: Date;
  /** Null while they are still in the class. */
  lastLeftAt: Date | null;
};

/** `now` closes a stay that is still open (the class is running). */
export function summarizeStays(stays: Stay[], now: Date): AttendanceSummary | null {
  if (!stays.length) return null;
  const intervals = stays
    .map((s) => [s.joinedAt.getTime(), (s.leftAt ?? now).getTime()] as const)
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const [from, to] of intervals) {
    if (current && from <= current[1]) current[1] = Math.max(current[1], to);
    else {
      if (current) total += current[1] - current[0];
      current = [from, to];
    }
  }
  if (current) total += current[1] - current[0];

  const open = stays.some((s) => !s.leftAt);
  return {
    minutes: Math.round(total / 60_000),
    joins: stays.length,
    firstJoinedAt: new Date(Math.min(...stays.map((s) => s.joinedAt.getTime()))),
    lastLeftAt: open ? null : new Date(Math.max(...stays.map((s) => s.leftAt!.getTime()))),
  };
}

/** "45 min", "1 orë 5 min", "2 orë". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} orë ${rest} min` : `${hours} orë`;
}
