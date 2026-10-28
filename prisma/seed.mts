/**
 * Local development seed — NEVER run against production.
 *   npm run db:seed          (or `npm run db:reset` to wipe and reseed)
 *
 * Creates placeholder academy content (clearly marked "[...]" — no invented facts about the
 * business), one admin, three students, lessons in every state and a sample PDF.
 * Dev accounts share SEED_PASSWORD (default below) so you can log in immediately.
 */
import "dotenv/config";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

const { prisma } = await import("@/server/db");
const { auth } = await import("@/server/auth/auth");
const { createInvitation } = await import("@/server/services/invitations");
const { newObjectKey, presignPut } = await import("@/server/storage/storage");

const PASSWORD = process.env.SEED_PASSWORD ?? "Demo-fjalekalim-2026";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

if ((await prisma.user.count()) > 0) {
  console.log("Database already has users — skipping seed. Use `npm run db:reset` to start over.");
  await prisma.$disconnect();
  process.exit(0);
}

const ctx = await auth.$context;

async function devUser(email: string, name: string, role: "admin" | "student") {
  const { user } = await auth.api.createUser({ body: { email, name, role } });
  await ctx.internalAdapter.createAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(PASSWORD) });
  return { id: user.id, name, email, role };
}

// --- Public content placeholders ----------------------------------------------------------
await prisma.academySettings.upsert({
  where: { id: 1 },
  update: {},
  create: {
    name: "Akademia CEM",
    tagline: "[Slogani i akademisë]",
    about: "[Historia e sallonit dhe e akademisë — do të plotësohet nga pronari.]",
    address: "[Adresa], Tiranë",
    phone: "[+355 6X XXX XXXX]",
    email: "[info@akademia.al]",
    whatsapp: "",
    openingHours: [
      { days: "E hënë – E premte", hours: "[09:00 – 19:00]" },
      { days: "E shtunë", hours: "[09:00 – 15:00]" },
    ],
  },
});
await prisma.service.createMany({
  data: ["Prerje dhe stilim flokësh", "Ngjyrosje flokësh", "Manikyr dhe pedikyr", "Trajtime të fytyrës"].map((title, position) => ({
    title,
    description: "[Përshkrimi i shërbimit]",
    priceText: "[Çmimi]",
    position,
  })),
});
const course = await prisma.course.create({
  data: { title: "Kursi profesional i estetikës", slug: "kursi-profesional-i-estetikes", summary: "[Përmbledhje e kursit]", isPublic: true, durationText: "[Kohëzgjatja]", priceText: "[Çmimi]" },
});

// --- Accounts -----------------------------------------------------------------------------
const admin = await devUser("admin@akademia.local", "Administratori", "admin");
const students = await Promise.all([
  devUser("ana@akademia.local", "Ana Hoxha", "student"),
  devUser("elira@akademia.local", "Elira Krasniqi", "student"),
  devUser("sara@akademia.local", "Sara Leka", "student"),
]);

// --- Lessons in every state ---------------------------------------------------------------
type LessonSeed = { title: string; startOffset: number; accessDays: number; publication?: "DRAFT" | "PUBLISHED"; meetingStatus?: "NOT_PROVISIONED" | "SCHEDULED" | "ENDED"; isDemo?: boolean };
async function lesson(seed: LessonSeed) {
  const start = new Date(now + seed.startOffset);
  return prisma.lesson.create({
    data: {
      title: seed.title,
      summary: "Mësim praktik me demonstrim live dhe pyetje-përgjigje.",
      details: "Sillni mjetet tuaja të punës. Materialet e mësimit gjenden në panelin anësor.",
      courseId: course.id,
      scheduledStartAt: start,
      scheduledEndAt: new Date(start.getTime() + 3 * HOUR),
      joinOpensAt: new Date(start.getTime() - 15 * 60_000),
      accessExpiresAt: new Date(start.getTime() + seed.accessDays * DAY),
      publication: seed.publication ?? "PUBLISHED",
      meetingStatus: seed.meetingStatus ?? "SCHEDULED",
      isDemo: seed.isDemo ?? false,
      liveStartedAt: seed.meetingStatus === "ENDED" ? start : null,
      liveEndedAt: seed.meetingStatus === "ENDED" ? new Date(start.getTime() + 3 * HOUR) : null,
      createdById: admin.id,
    },
  });
}

const draft = await lesson({ title: "Mësim në përgatitje (draft)", startOffset: 14 * DAY, accessDays: 30, publication: "DRAFT", meetingStatus: "NOT_PROVISIONED" });
const demo = await lesson({ title: "Klasa demo — teknikat e ngjyrosjes", startOffset: 20 * 60_000, accessDays: 30, isDemo: true });
const upcoming = await lesson({ title: "Stilimi për ceremoni", startOffset: 3 * DAY, accessDays: 30 });
const replay = await lesson({ title: "Bazat e kujdesit për lëkurën", startOffset: -2 * DAY, accessDays: 28, meetingStatus: "ENDED" });
const expired = await lesson({ title: "Hyrje në manikyr (skaduar)", startOffset: -45 * DAY, accessDays: 30, meetingStatus: "ENDED" });
void draft;

const [ana, elira, sara] = students;
const enroll = (lessonId: string, userId: string, accessExpiresAt?: Date) =>
  prisma.lessonEnrollment.create({ data: { lessonId, userId, source: "ADMIN", grantedById: admin.id, accessExpiresAt } });
for (const l of [demo, upcoming, replay, expired]) {
  await enroll(l.id, ana.id);
  await enroll(l.id, elira.id);
}
// Sara has a shorter personal deadline on the replay lesson (expires tomorrow).
await enroll(replay.id, sara.id, new Date(now + DAY));
// All three attend the course; Sara isn't in the upcoming lesson yet, so its roster offers her.
await prisma.courseMember.createMany({ data: students.map((s) => ({ courseId: course.id, userId: s.id })) });

// --- Sample material (original, generated here) ------------------------------------------
function samplePdf(title: string): Uint8Array<ArrayBuffer> {
  const text = title.replace(/[()\\]/g, "");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${44 + text.length} >>\nstream\nBT /F1 20 Tf 72 760 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body) as Uint8Array<ArrayBuffer>;
}

// One sample handout in the library, shown in all three lessons.
const bytes = samplePdf("Material demonstrues - Akademia CEM");
const objectKey = newObjectKey("materials", "library");
const url = await presignPut({ key: objectKey, contentType: "application/pdf", contentLength: bytes.byteLength });
const put = await fetch(url, { method: "PUT", body: bytes, headers: { "Content-Type": "application/pdf" } });
if (!put.ok) throw new Error(`Sample upload failed (${put.status}). Did you run npm run storage:init?`);
const handout = await prisma.materialFile.create({
  data: { objectKey, displayName: "Material demonstrues.pdf", mimeType: "application/pdf", sizeBytes: BigInt(bytes.byteLength), status: "READY", uploadedById: admin.id },
});
await prisma.lessonMaterial.createMany({ data: [demo, replay, upcoming].map((l) => ({ lessonId: l.id, fileId: handout.id })) });

const invite = await createInvitation({ lessonId: upcoming.id, redeemUntil: new Date(now + 2 * DAY), maxRedemptions: 30 }, admin);

console.log(`
Seed complete (local development only).
  Admin:    admin@akademia.local
  Students: ana@akademia.local, elira@akademia.local, sara@akademia.local (all in the course; Sara is not enrolled in the upcoming lesson)
  Password: ${PASSWORD}
  Shared invitation link for "${upcoming.title}":
    ${invite.url}
`);
await prisma.$disconnect();
