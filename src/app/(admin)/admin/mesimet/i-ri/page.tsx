import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { LessonForm } from "@/components/admin/lessons/lesson-form";
import { PageHeader } from "@/components/admin/page-parts";
import { admin } from "@/i18n/admin";
import { requirePageUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { listCourses } from "@/server/queries/admin";

export const metadata: Metadata = { title: admin.lessons.newTitle };

export default async function NewLessonPage() {
  await requirePageUser("admin");
  const courses = await listCourses();
  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/mesimet" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {admin.lessons.backToList}
      </Link>
      <PageHeader title={admin.lessons.newTitle} intro={admin.lessons.newIntro} />
      <div className="rounded-md border bg-card p-4 sm:p-6">
        <LessonForm courses={courses} demoAllowed={env.ZOOM_MODE === "demo"} />
      </div>
    </div>
  );
}
