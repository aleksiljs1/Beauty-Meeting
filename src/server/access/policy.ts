/**
 * Central lesson access policy — pure functions, no I/O.
 *
 * Every protected endpoint (lesson details, materials, recordings, meeting credentials,
 * download/playback grants) must decide through `evaluateLessonAccess` + `checkCapability`.
 * Do not write ad-hoc date comparisons elsewhere.
 *
 * Time rules:
 *  - All comparisons use server time passed in as `now` (injectable for tests).
 *  - A deadline is exclusive: `now >= deadline` means expired.
 *  - Effective deadline = the earlier of the lesson deadline and the student's own deadline.
 */
import type { MeetingStatus, PublicationStatus } from "@/generated/prisma/enums";
import type { ApiErrorCode } from "@/lib/api/types";

export type AccessViewer = { id: string; role: "admin" | "student" };

export type AccessLesson = {
  publication: PublicationStatus;
  meetingStatus: MeetingStatus;
  joinOpensAt: Date;
  accessExpiresAt: Date;
};

export type AccessEnrollment = {
  accessExpiresAt: Date | null;
  revokedAt: Date | null;
} | null;

export type DenialReason = "NOT_ENROLLED" | "REVOKED" | "NOT_PUBLISHED" | "CANCELLED" | "EXPIRED";

export type LessonAccess =
  | { status: "admin" }
  | { status: "granted"; deadline: Date }
  | { status: "denied"; reason: DenialReason; deadline: Date | null };

export type Capability =
  | "VIEW_CARD" // title, schedule, status — may remain visible as history
  | "VIEW_CONTENT" // details, materials, recordings
  | "JOIN_LIVE"; // request meeting credentials

export type CapabilityResult = { allowed: true } | { allowed: false; code: ApiErrorCode; message: string };

export const isExpired = (deadline: Date, now: Date) => now.getTime() >= deadline.getTime();

export function effectiveDeadline(lesson: Pick<AccessLesson, "accessExpiresAt">, enrollment: AccessEnrollment): Date {
  const own = enrollment?.accessExpiresAt;
  return own && own.getTime() < lesson.accessExpiresAt.getTime() ? own : lesson.accessExpiresAt;
}

export function evaluateLessonAccess(
  viewer: AccessViewer,
  lesson: AccessLesson,
  enrollment: AccessEnrollment,
  now: Date,
): LessonAccess {
  if (viewer.role === "admin") return { status: "admin" };

  if (!enrollment) return { status: "denied", reason: "NOT_ENROLLED", deadline: null };
  const deadline = effectiveDeadline(lesson, enrollment);

  // Order matters: the most specific, user-meaningful reason wins.
  if (enrollment.revokedAt) return { status: "denied", reason: "REVOKED", deadline };
  if (lesson.publication === "DRAFT" || lesson.publication === "ARCHIVED") {
    return { status: "denied", reason: "NOT_PUBLISHED", deadline };
  }
  if (lesson.publication === "CANCELLED") return { status: "denied", reason: "CANCELLED", deadline };
  if (isExpired(deadline, now)) return { status: "denied", reason: "EXPIRED", deadline };

  return { status: "granted", deadline };
}

const NOT_AVAILABLE: CapabilityResult = {
  allowed: false,
  code: "LESSON_NOT_AVAILABLE",
  message: "Ky mësim nuk është i disponueshëm.",
};

export function checkCapability(access: LessonAccess, capability: Capability, lesson: AccessLesson, now: Date): CapabilityResult {
  if (capability === "VIEW_CARD") {
    if (access.status !== "denied") return { allowed: true };
    // Expired/cancelled lessons stay listed as history; unknown/unpublished/revoked ones are hidden.
    return access.reason === "EXPIRED" || access.reason === "CANCELLED" ? { allowed: true } : NOT_AVAILABLE;
  }

  if (access.status === "denied") {
    if (access.reason === "EXPIRED") {
      return { allowed: false, code: "LESSON_ACCESS_EXPIRED", message: "Afati i aksesit për këtë mësim ka përfunduar." };
    }
    if (access.reason === "CANCELLED") {
      return { allowed: false, code: "LESSON_NOT_AVAILABLE", message: "Ky mësim është anuluar." };
    }
    return NOT_AVAILABLE; // non-disclosing for not-enrolled / revoked / unpublished
  }

  if (capability === "VIEW_CONTENT") return { allowed: true };

  // JOIN_LIVE — admins host through a separate, admin-only path, but may also preview.
  if (lesson.meetingStatus === "ENDED") {
    return { allowed: false, code: "LESSON_JOIN_NOT_OPEN", message: "Mësimi live ka përfunduar." };
  }
  if (lesson.meetingStatus === "NOT_PROVISIONED" || lesson.meetingStatus === "ERROR") {
    return { allowed: false, code: "LESSON_JOIN_NOT_OPEN", message: "Klasa live nuk është gati ende." };
  }
  // The join window only applies before the host starts: once the class is LIVE (the teacher may
  // start early), enrolled students can join straight away. Access deadlines still apply above.
  if (access.status === "granted" && lesson.meetingStatus !== "LIVE" && now.getTime() < lesson.joinOpensAt.getTime()) {
    return { allowed: false, code: "LESSON_JOIN_NOT_OPEN", message: "Hyrja në mësim nuk është hapur ende." };
  }
  return { allowed: true };
}

/**
 * Upper bound for any short-lived grant (presigned URL, SDK signature) derived from access:
 * never longer than `maxSeconds`, never past the student's deadline.
 */
export function grantLifetimeSeconds(access: LessonAccess, maxSeconds: number, now: Date): number {
  if (access.status !== "granted") return maxSeconds;
  const remaining = Math.floor((access.deadline.getTime() - now.getTime()) / 1000);
  return Math.max(1, Math.min(maxSeconds, remaining));
}

/** Student-facing state for lesson cards and filters ("Upcoming", "Live", "Replay", "Expired"). */
export type LessonPhase = "UPCOMING" | "STARTING_SOON" | "WAITING_FOR_HOST" | "LIVE" | "REPLAY" | "ENDED" | "EXPIRED" | "CANCELLED";

export function lessonPhase(
  lesson: AccessLesson & { scheduledStartAt: Date },
  access: LessonAccess,
  hasReadyRecording: boolean,
  now: Date,
  startingSoonMs = 10 * 60_000,
): LessonPhase {
  if (lesson.publication === "CANCELLED") return "CANCELLED";
  if (access.status === "denied" && access.reason === "EXPIRED") return "EXPIRED";
  if (lesson.meetingStatus === "LIVE") return "LIVE";
  if (lesson.meetingStatus === "ENDED") return hasReadyRecording ? "REPLAY" : "ENDED";
  const msToStart = lesson.scheduledStartAt.getTime() - now.getTime();
  if (now.getTime() >= lesson.joinOpensAt.getTime() && msToStart <= 0) return "WAITING_FOR_HOST";
  if (msToStart <= startingSoonMs) return "STARTING_SOON";
  return "UPCOMING";
}
