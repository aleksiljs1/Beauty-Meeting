import { describe, expect, it } from "vitest";
import {
  checkCapability,
  evaluateLessonAccess,
  grantLifetimeSeconds,
  lessonPhase,
  type AccessEnrollment,
  type AccessLesson,
  type AccessViewer,
} from "./policy";

const student: AccessViewer = { id: "s1", role: "student" };
const admin: AccessViewer = { id: "a1", role: "admin" };

const DEADLINE = new Date("2026-11-30T22:00:00.000Z");
const JOIN_OPENS = new Date("2026-11-01T08:45:00.000Z");

const lesson = (overrides: Partial<AccessLesson> = {}): AccessLesson => ({
  publication: "PUBLISHED",
  meetingStatus: "SCHEDULED",
  joinOpensAt: JOIN_OPENS,
  accessExpiresAt: DEADLINE,
  ...overrides,
});

const enrolled = (overrides: Partial<NonNullable<AccessEnrollment>> = {}): AccessEnrollment => ({
  accessExpiresAt: null,
  revokedAt: null,
  ...overrides,
});

const ms = (date: Date, delta: number) => new Date(date.getTime() + delta);

describe("evaluateLessonAccess", () => {
  it("grants an enrolled student before the deadline", () => {
    const access = evaluateLessonAccess(student, lesson(), enrolled(), ms(DEADLINE, -1));
    expect(access).toEqual({ status: "granted", deadline: DEADLINE });
  });

  it("treats now === deadline as expired (exclusive deadline)", () => {
    const access = evaluateLessonAccess(student, lesson(), enrolled(), DEADLINE);
    expect(access).toMatchObject({ status: "denied", reason: "EXPIRED" });
  });

  it("applies a shorter per-student deadline", () => {
    const own = new Date("2026-11-10T00:00:00.000Z");
    expect(evaluateLessonAccess(student, lesson(), enrolled({ accessExpiresAt: own }), ms(own, -1))).toEqual({
      status: "granted",
      deadline: own,
    });
    expect(evaluateLessonAccess(student, lesson(), enrolled({ accessExpiresAt: own }), own)).toMatchObject({
      status: "denied",
      reason: "EXPIRED",
    });
  });

  it("never lets a per-student deadline extend beyond the lesson deadline", () => {
    const later = ms(DEADLINE, 7 * 86_400_000);
    const access = evaluateLessonAccess(student, lesson(), enrolled({ accessExpiresAt: later }), DEADLINE);
    expect(access).toMatchObject({ status: "denied", reason: "EXPIRED", deadline: DEADLINE });
  });

  it("denies students who are not enrolled", () => {
    expect(evaluateLessonAccess(student, lesson(), null, JOIN_OPENS)).toMatchObject({ reason: "NOT_ENROLLED" });
  });

  it("denies revoked enrolments even before the deadline", () => {
    const access = evaluateLessonAccess(student, lesson(), enrolled({ revokedAt: JOIN_OPENS }), JOIN_OPENS);
    expect(access).toMatchObject({ status: "denied", reason: "REVOKED" });
  });

  it("denies draft, archived and cancelled lessons", () => {
    for (const publication of ["DRAFT", "ARCHIVED"] as const) {
      expect(evaluateLessonAccess(student, lesson({ publication }), enrolled(), JOIN_OPENS)).toMatchObject({
        reason: "NOT_PUBLISHED",
      });
    }
    expect(evaluateLessonAccess(student, lesson({ publication: "CANCELLED" }), enrolled(), JOIN_OPENS)).toMatchObject({
      reason: "CANCELLED",
    });
  });

  it("always allows the administrator", () => {
    expect(evaluateLessonAccess(admin, lesson({ publication: "DRAFT" }), null, ms(DEADLINE, 1))).toEqual({ status: "admin" });
  });
});

describe("checkCapability", () => {
  const now = ms(JOIN_OPENS, 60_000);

  it("keeps expired lessons visible as history but blocks their content and join", () => {
    const access = evaluateLessonAccess(student, lesson(), enrolled(), DEADLINE);
    expect(checkCapability(access, "VIEW_CARD", lesson(), DEADLINE)).toEqual({ allowed: true });
    expect(checkCapability(access, "VIEW_CONTENT", lesson(), DEADLINE)).toMatchObject({ code: "LESSON_ACCESS_EXPIRED" });
    expect(checkCapability(access, "JOIN_LIVE", lesson({ meetingStatus: "LIVE" }), DEADLINE)).toMatchObject({
      code: "LESSON_ACCESS_EXPIRED",
    });
  });

  it("hides lessons from revoked or unrelated students without revealing why", () => {
    const revoked = evaluateLessonAccess(student, lesson(), enrolled({ revokedAt: now }), now);
    const stranger = evaluateLessonAccess(student, lesson(), null, now);
    for (const access of [revoked, stranger]) {
      expect(checkCapability(access, "VIEW_CARD", lesson(), now)).toMatchObject({ code: "LESSON_NOT_AVAILABLE" });
      expect(checkCapability(access, "VIEW_CONTENT", lesson(), now)).toMatchObject({ code: "LESSON_NOT_AVAILABLE" });
    }
  });

  it("opens joining only from joinOpensAt", () => {
    const live = lesson({ meetingStatus: "LIVE" });
    const before = ms(JOIN_OPENS, -1);
    expect(checkCapability(evaluateLessonAccess(student, live, enrolled(), before), "JOIN_LIVE", live, before)).toMatchObject({
      code: "LESSON_JOIN_NOT_OPEN",
    });
    expect(checkCapability(evaluateLessonAccess(student, live, enrolled(), JOIN_OPENS), "JOIN_LIVE", live, JOIN_OPENS)).toEqual({
      allowed: true,
    });
  });

  it("blocks joining an ended or unprovisioned meeting", () => {
    for (const meetingStatus of ["ENDED", "NOT_PROVISIONED", "ERROR"] as const) {
      const l = lesson({ meetingStatus });
      expect(checkCapability(evaluateLessonAccess(student, l, enrolled(), now), "JOIN_LIVE", l, now)).toMatchObject({
        allowed: false,
      });
    }
  });
});

describe("grantLifetimeSeconds", () => {
  it("never outlives the student's deadline", () => {
    const access = evaluateLessonAccess(student, lesson(), enrolled(), ms(DEADLINE, -20_000));
    expect(grantLifetimeSeconds(access, 60, ms(DEADLINE, -20_000))).toBe(20);
    expect(grantLifetimeSeconds(access, 60, ms(DEADLINE, -3_600_000))).toBe(60);
  });
});

describe("lessonPhase", () => {
  const start = new Date("2026-11-01T09:00:00.000Z");
  const l = (overrides: Partial<AccessLesson> = {}) => ({ ...lesson(overrides), scheduledStartAt: start });
  const granted = { status: "granted", deadline: DEADLINE } as const;

  it("says 'starting soon' — never 'live' — before Zoom confirms the meeting started", () => {
    expect(lessonPhase(l(), granted, false, ms(start, -5 * 60_000))).toBe("STARTING_SOON");
    expect(lessonPhase(l(), granted, false, ms(start, 60_000))).toBe("WAITING_FOR_HOST");
    expect(lessonPhase(l({ meetingStatus: "LIVE" }), granted, false, ms(start, 60_000))).toBe("LIVE");
  });

  it("shows replay only when a recording is ready", () => {
    expect(lessonPhase(l({ meetingStatus: "ENDED" }), granted, false, ms(start, 4 * 3_600_000))).toBe("ENDED");
    expect(lessonPhase(l({ meetingStatus: "ENDED" }), granted, true, ms(start, 4 * 3_600_000))).toBe("REPLAY");
  });
});
