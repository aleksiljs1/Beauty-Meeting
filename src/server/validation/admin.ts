import "server-only";
import { z } from "zod";
import { studentProfileSchema } from "@/lib/student-profile";
import { ApiError } from "@/server/http";

/** Zod schemas and param helpers shared by the /api/v1/admin route handlers. */

const isoDate = z.iso.datetime({ offset: true, message: "Data nuk është e vlefshme." }).transform((value) => new Date(value));
const optionalText = (max: number) => z.string().max(max, "Teksti është shumë i gjatë.").nullish();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Domain ids are UUIDs; anything else is simply "not found" (and never reaches Postgres). */
export function uuidParam(value: string, message = "Nuk u gjet.") {
  if (!UUID.test(value)) throw new ApiError("NOT_FOUND", message);
  return value;
}

/** Better Auth user ids are opaque strings. */
export function userIdParam(value: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new ApiError("NOT_FOUND", "Studenti nuk u gjet.");
  return value;
}

export const pageQuery = (value: string | null) => {
  const page = Number(value ?? "1");
  return Number.isInteger(page) && page > 0 && page < 10_000 ? page : 1;
};

const courseIds = z.array(z.uuid()).max(50);
const studentIds = z.array(z.string().min(1).max(100)).max(500);

export const createStudentSchema = z.object({
  name: z.string().trim().min(2, "Shkruani emrin.").max(100),
  email: z.email("Email i pavlefshëm.").max(200),
  courseIds: courseIds.optional(),
  /** Also enrol the student in the upcoming lessons of those courses. */
  addToUpcoming: z.boolean().optional(),
  profile: studentProfileSchema.optional(),
});

export const studentCoursesSchema = z.object({ courseIds, addToUpcoming: z.boolean().optional() });

export const updateStudentSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.email("Email i pavlefshëm.").max(200).transform((value) => value.trim().toLowerCase()).optional(),
    active: z.boolean().optional(),
    profile: studentProfileSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.active !== undefined || v.profile !== undefined, "Asgjë për të ndryshuar.");

const lessonFields = {
  title: z.string().trim().min(2, "Shkruani titullin.").max(200),
  summary: optionalText(1_000),
  details: optionalText(20_000),
  courseId: z.uuid().nullish(),
  isDemo: z.boolean().optional(),
  scheduledStartAt: isoDate,
  scheduledEndAt: isoDate,
  joinOpensAt: isoDate,
  accessExpiresAt: isoDate,
};

export const createLessonSchema = z.object({ ...lessonFields, confirmEarlyDeadline: z.boolean().optional(), studentIds: studentIds.optional() });

export const updateLessonSchema = z.object({
  title: lessonFields.title.optional(),
  summary: lessonFields.summary,
  details: lessonFields.details,
  courseId: lessonFields.courseId,
  isDemo: lessonFields.isDemo,
  scheduledStartAt: isoDate.optional(),
  scheduledEndAt: isoDate.optional(),
  joinOpensAt: isoDate.optional(),
  accessExpiresAt: isoDate.optional(),
  confirmEarlyDeadline: z.boolean().optional(),
});

export const publicationSchema = z.object({ publication: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "CANCELLED"]) });
export const demoActionSchema = z.object({ action: z.enum(["live", "end", "reset"]) });

export const enrollStudentsSchema = z.object({ userIds: studentIds.min(1), restoreRevoked: z.boolean().optional() });
export const grantEnrollmentSchema = z.object({ userId: z.string().min(1).max(100), accessExpiresAt: isoDate.nullish() });
export const updateEnrollmentSchema = z
  .object({ revoked: z.boolean().optional(), accessExpiresAt: isoDate.nullable().optional() })
  .refine((v) => v.revoked !== undefined || v.accessExpiresAt !== undefined, "Asgjë për të ndryshuar.");

export const createInvitationSchema = z.object({
  redeemUntil: isoDate,
  accessExpiresAt: isoDate.nullish(),
  maxRedemptions: z.number().int().min(1).max(1000).nullish(),
});

export const startUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
});

export const updateMaterialSchema = z
  .object({ displayName: z.string().trim().min(1).max(150).optional(), move: z.enum(["up", "down"]).optional() })
  .refine((v) => v.displayName !== undefined || v.move !== undefined, "Asgjë për të ndryshuar.");

export const presignPartsSchema = z.object({ partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(20) });
export const completeRecordingSchema = z.object({
  parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) })).min(1).max(10_000),
});
/** Single-PUT materials finish with an empty body; multipart (video) materials send their parts. */
export const finishMaterialSchema = z.object({ parts: completeRecordingSchema.shape.parts.optional() });

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data nuk është e vlefshme.");
const studentId = z.string().min(1).max(100);

export const paymentAccountQuery = z.object({ courseId: z.uuid(), userId: studentId });

export const recordPaymentSchema = paymentAccountQuery.extend({
  months: z.number().int().min(1, "Të paktën 1 muaj.").max(120),
  /** Euro cents: what was actually paid (a yearly payment may be discounted). */
  amountCents: z.number().int().min(0).max(100_000_000),
  paidOn: calendarDay,
  method: z.enum(["CASH", "BANK", "OTHER"]),
  note: optionalText(500),
});

export const cancelPaymentSchema = z.object({ reason: z.string().trim().min(3, "Shkruani arsyen.").max(300) });

export const firstMonthSchema = z.object({ firstMonth: z.number().int().min(1).max(120) });
