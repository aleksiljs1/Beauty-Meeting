import "server-only";
import { summarizeStays, type AttendanceSummary } from "@/lib/attendance";
import { effectiveMeetingStatus } from "@/server/access/policy";
import { prisma } from "@/server/db";
import { matchParticipant } from "@/server/zoom/recording-files";

/**
 * Who was in a lesson's live class, from Zoom's participant joined/left events. Each stay is one
 * row; a rejoin is a new row. Rows are matched to our students by the key our site passes to
 * Zoom (or, for the Zoom app, by name), and closed when the person leaves or the meeting ends.
 */

export type ParticipantEvent = {
  /** Zoom's id for the person in this meeting. */
  key: string;
  name: string;
  customerKey?: string | null;
  at: Date;
  /** On a "left" event Zoom may also say when they joined (if the join event was missed). */
  joinedAt?: Date | null;
};

async function studentsOf(lessonId: string) {
  const rows = await prisma.lessonEnrollment.findMany({ where: { lessonId }, select: { user: { select: { id: true, name: true } } } });
  return rows.map((r) => r.user);
}

export async function recordParticipantJoined(lessonId: string, event: ParticipantEvent) {
  const userId = matchParticipant({ customerKey: event.customerKey, name: event.name }, await studentsOf(lessonId));
  await prisma.lessonAttendance.createMany({
    data: [{ lessonId, userId, participantKey: event.key, displayName: event.name.slice(0, 200), joinedAt: event.at }],
    skipDuplicates: true, // a repeated event (same person, same join time)
  });
}

export async function recordParticipantLeft(lessonId: string, event: ParticipantEvent) {
  const open = await prisma.lessonAttendance.findFirst({
    where: { lessonId, participantKey: event.key, leftAt: null, joinedAt: { lte: event.at } },
    orderBy: { joinedAt: "desc" },
    select: { id: true },
  });
  if (open) {
    await prisma.lessonAttendance.update({ where: { id: open.id }, data: { leftAt: event.at } });
    return;
  }
  // The join was missed: keep the whole stay when Zoom tells us when it began.
  if (event.joinedAt && event.joinedAt < event.at) {
    const userId = matchParticipant({ customerKey: event.customerKey, name: event.name }, await studentsOf(lessonId));
    await prisma.lessonAttendance.createMany({
      data: [{ lessonId, userId, participantKey: event.key, displayName: event.name.slice(0, 200), joinedAt: event.joinedAt, leftAt: event.at }],
      skipDuplicates: true,
    });
  }
}

/** The meeting ended: whoever is still "in" left then. */
export async function closeOpenAttendance(lessonId: string, endedAt: Date) {
  await prisma.lessonAttendance.updateMany({ where: { lessonId, leftAt: null, joinedAt: { lte: endedAt } }, data: { leftAt: endedAt } });
}

export type AttendanceRow = { userId: string | null; name: string } & AttendanceSummary;

/**
 * The lesson's attendance for the admin: enrolled students who came (with their time), those who
 * didn't, and anyone else who was in the class (e.g. a guest, or a name that matched nobody).
 */
export async function getLessonAttendance(lessonId: string, now = new Date()) {
  const [lesson, recorded, enrolled] = await Promise.all([
    prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, select: { meetingStatus: true, scheduledEndAt: true, liveEndedAt: true } }),
    prisma.lessonAttendance.findMany({ where: { lessonId }, orderBy: { joinedAt: "asc" }, select: { userId: true, displayName: true, joinedAt: true, leftAt: true } }),
    prisma.lessonEnrollment.findMany({
      where: { lessonId, revokedAt: null },
      orderBy: { user: { name: "asc" } },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);

  // Once the class is over nobody is still in it, even if a "left" or "ended" event never came:
  // an open stay ends with the class (or, if Zoom never said when it ended, at the scheduled end).
  const over = effectiveMeetingStatus(lesson, now) === "ENDED";
  const endedAt = lesson.liveEndedAt ?? lesson.scheduledEndAt;
  const stays = recorded.map((stay) =>
    stay.leftAt || !over ? stay : { ...stay, leftAt: new Date(Math.max(endedAt.getTime(), stay.joinedAt.getTime())) },
  );

  const byPerson = new Map<string, { userId: string | null; name: string; stays: typeof stays }>();
  for (const stay of stays) {
    const key = stay.userId ?? `name:${stay.displayName.trim().toLowerCase()}`;
    const entry = byPerson.get(key) ?? { userId: stay.userId, name: stay.displayName, stays: [] };
    entry.stays.push(stay);
    byPerson.set(key, entry);
  }
  const nameOf = new Map(enrolled.map((e) => [e.user.id, e.user.name]));
  const rows: AttendanceRow[] = [...byPerson.values()].map((p) => ({
    userId: p.userId,
    name: (p.userId && nameOf.get(p.userId)) || p.name,
    ...summarizeStays(p.stays, now)!,
  }));

  return {
    attended: rows.filter((r) => r.userId && nameOf.has(r.userId)).sort((a, b) => a.name.localeCompare(b.name, "sq")),
    absent: enrolled.filter((e) => !byPerson.has(e.user.id)).map((e) => ({ userId: e.user.id, name: e.user.name })),
    others: rows.filter((r) => !r.userId || !nameOf.has(r.userId)),
    enrolledCount: enrolled.length,
    hasData: stays.length > 0,
  };
}
