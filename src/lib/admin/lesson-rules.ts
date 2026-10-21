/**
 * Pure lesson schedule rules shared by the admin form (instant feedback) and the server
 * (authoritative check). No I/O, no framework imports — unit-tested.
 */

export type LessonSchedule = {
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  joinOpensAt: Date;
  accessExpiresAt: Date;
};

export type ScheduleIssue = { path: keyof LessonSchedule | "confirmEarlyDeadline"; message: string };

/** Path of the issue the UI turns into a confirmation dialog instead of a plain error. */
export const EARLY_DEADLINE_ISSUE_PATH = "confirmEarlyDeadline";

export const scheduleMessages = {
  endBeforeStart: "Përfundimi duhet të jetë pas fillimit.",
  joinAfterStart: "Hyrja nuk mund të hapet pas fillimit të mësimit.",
  deadlineBeforeStart: "Afati i aksesit duhet të jetë pas fillimit të mësimit.",
  earlyDeadline:
    "Afati i aksesit është para përfundimit të mësimit. Studentët do ta humbin aksesin gjatë mësimit. Konfirmoni nëse kjo është e qëllimshme.",
} as const;

/**
 * Validates a complete schedule. An access deadline before the scheduled end is allowed only
 * with an explicit confirmation (it cuts students off mid-lesson).
 */
export function validateLessonSchedule(schedule: LessonSchedule, confirmEarlyDeadline = false): ScheduleIssue[] {
  const start = schedule.scheduledStartAt.getTime();
  const end = schedule.scheduledEndAt.getTime();
  const join = schedule.joinOpensAt.getTime();
  const deadline = schedule.accessExpiresAt.getTime();
  const issues: ScheduleIssue[] = [];

  if (!(end > start)) issues.push({ path: "scheduledEndAt", message: scheduleMessages.endBeforeStart });
  if (join > start) issues.push({ path: "joinOpensAt", message: scheduleMessages.joinAfterStart });
  if (!(deadline > start)) {
    issues.push({ path: "accessExpiresAt", message: scheduleMessages.deadlineBeforeStart });
  } else if (deadline < end && !confirmEarlyDeadline) {
    issues.push({ path: EARLY_DEADLINE_ISSUE_PATH, message: scheduleMessages.earlyDeadline });
  }
  return issues;
}

/** True when the only remaining problem is the unconfirmed early deadline. */
export const needsEarlyDeadlineConfirmation = (issues: { path: string }[]) =>
  issues.length > 0 && issues.every((issue) => issue.path === EARLY_DEADLINE_ISSUE_PATH);

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const DEFAULT_JOIN_OPENS_BEFORE_MIN = 15;
export const DEFAULT_ACCESS_DAYS_AFTER_END = 30;
export const DEFAULT_DURATION_MIN = 120;

/** Sensible defaults derived from start/end: join opens 15 min before, access 30 days after the end. */
export function defaultSchedule(start: Date, end = new Date(start.getTime() + DEFAULT_DURATION_MIN * MINUTE)): LessonSchedule {
  return {
    scheduledStartAt: start,
    scheduledEndAt: end,
    joinOpensAt: new Date(start.getTime() - DEFAULT_JOIN_OPENS_BEFORE_MIN * MINUTE),
    accessExpiresAt: new Date(end.getTime() + DEFAULT_ACCESS_DAYS_AFTER_END * DAY),
  };
}

/** Next full hour at least a day ahead — the starting point of a new lesson form. */
export function suggestedStart(now: Date): Date {
  const date = new Date(now.getTime() + DAY);
  date.setUTCMinutes(0, 0, 0);
  return date;
}

/** Whether a change touches fields that existing enrolments/invitations don't follow automatically. */
export function scheduleChanged(before: LessonSchedule, after: Partial<LessonSchedule>): boolean {
  return (Object.keys(after) as (keyof LessonSchedule)[]).some(
    (key) => after[key] !== undefined && after[key]!.getTime() !== before[key].getTime(),
  );
}
