import "server-only";
import { prisma } from "@/server/db";
import { zoomLive } from "@/server/env";

export type ChecklistId = "settings" | "course" | "billing" | "student" | "lesson" | "enrolled" | "zoom" | "gallery" | "reminders";
export type ChecklistItem = { id: ChecklistId; done: boolean; href: string; guideId: string };

/** "First steps" for the academy, each ticked from what is really there (never stored). */
export async function getSetupChecklist(adminId: string): Promise<ChecklistItem[]> {
  const [settings, courses, billedCourses, students, published, enrolled, gallery, preferences] = await Promise.all([
    prisma.academySettings.findUnique({ where: { id: 1 }, select: { phone: true, email: true, whatsapp: true, address: true } }),
    prisma.course.count(),
    prisma.course.count({ where: { startsOn: { not: null }, durationMonths: { not: null }, monthlyPriceCents: { not: null } } }),
    prisma.user.count({ where: { role: "student" } }),
    prisma.lesson.count({ where: { publication: "PUBLISHED", isDemo: false } }),
    prisma.lessonEnrollment.count({ where: { revokedAt: null, lesson: { isDemo: false } } }),
    prisma.galleryItem.count(),
    prisma.adminPreferences.findUnique({ where: { userId: adminId }, select: { lessonReminderEnabled: true } }),
  ]);
  const hasContacts = !!(settings && (settings.phone || settings.email || settings.whatsapp) && settings.address);

  return [
    { id: "settings", done: hasContacts, href: "/admin/permbajtja/te-dhenat", guideId: "te-dhenat" },
    { id: "course", done: courses > 0, href: "/admin/permbajtja/kurset", guideId: "kursi" },
    { id: "billing", done: billedCourses > 0, href: "/admin/permbajtja/kurset", guideId: "kursi" },
    { id: "student", done: students > 0, href: "/admin/studentet?krijo=1", guideId: "student-i-ri" },
    { id: "lesson", done: published > 0, href: "/admin/mesimet/i-ri", guideId: "mesimi" },
    { id: "enrolled", done: enrolled > 0, href: "/admin/mesimet", guideId: "ftesa" },
    { id: "zoom", done: zoomLive, href: "/admin/integrimet", guideId: "nis-klasen" },
    { id: "gallery", done: gallery > 0, href: "/admin/permbajtja/galeria", guideId: "galeria" },
    { id: "reminders", done: !!preferences?.lessonReminderEnabled, href: "/admin/cilesimet", guideId: "kujtesa" },
  ];
}
