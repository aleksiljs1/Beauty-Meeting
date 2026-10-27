import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";
import { EmptyState, PageHeader, Pagination } from "@/components/admin/page-parts";
import { CreateStudentDialog } from "@/components/admin/students/create-student-dialog";
import { StudentActions } from "@/components/admin/students/student-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { admin } from "@/i18n/admin";
import { requirePageUser } from "@/server/auth/session";
import { cn } from "@/lib/utils";
import { listCourses, listStudents } from "@/server/queries/admin";

export const metadata: Metadata = { title: admin.students.title };

const t = admin.students;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function Chip({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:border-rose/50 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export default async function StudentsPage({ searchParams }: PageProps<"/admin/studentet">) {
  await requirePageUser("admin");
  const params = await searchParams;
  const q = one(params.q)?.trim().slice(0, 100) ?? "";
  const page = Math.max(1, Number(one(params.faqe)) || 1);
  const courses = await listCourses();
  const courseId = courses.find((c) => c.id === one(params.kursi))?.id;
  const result = await listStudents({ q, page, courseId });

  const buildHref = ({ p = 1, kursi = courseId }: { p?: number; kursi?: string }) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (kursi) search.set("kursi", kursi);
    if (p > 1) search.set("faqe", String(p));
    return search.size ? `/admin/studentet?${search}` : "/admin/studentet";
  };
  const href = (p: number) => buildHref({ p });

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} intro={t.intro} actions={<CreateStudentDialog defaultOpen={one(params.krijo) === "1"} courses={courses} />} />

      <Form action="/admin/studentet" className="flex max-w-lg items-end gap-2" role="search">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="student-search">{t.searchLabel}</Label>
          <Input id="student-search" name="q" type="search" defaultValue={q} placeholder={t.searchPlaceholder} />
          {courseId && <input type="hidden" name="kursi" value={courseId} />}
        </div>
        <Button type="submit" variant="outline">
          <Search aria-hidden /> {t.search}
        </Button>
      </Form>

      {courses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.courseFilter}>
          <span className="text-xs text-muted-foreground">{t.courseFilter}</span>
          <Chip href={buildHref({ kursi: "" })} active={!courseId}>
            {t.allCourses}
          </Chip>
          {courses.map((course) => (
            <Chip key={course.id} href={buildHref({ kursi: course.id })} active={courseId === course.id}>
              {course.title}
            </Chip>
          ))}
        </div>
      )}

      {result.items.length === 0 ? (
        <EmptyState>{q || courseId ? t.emptySearch : t.empty}</EmptyState>
      ) : (
        <div className="rounded-md border bg-card">
          <div className="hidden grid-cols-[2fr_2fr_1fr_6rem_3rem] gap-4 border-b px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>{t.columns.name}</span>
            <span>{t.columns.email}</span>
            <span>{t.columns.courses}</span>
            <span>{t.columns.status}</span>
            <span className="text-right">{t.columns.enrollments}</span>
            <span className="sr-only">{t.columns.actions}</span>
          </div>
          <ul className="divide-y">
            {result.items.map((student) => (
              <li key={student.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[2fr_2fr_1.5fr_1fr_6rem_3rem]">
                <span className="font-medium">{student.name}</span>
                <span className="col-start-1 truncate text-sm text-muted-foreground md:col-start-auto">{student.email}</span>
                <span className="col-start-1 text-sm md:col-start-auto">
                  <span className="text-muted-foreground md:sr-only">{t.columns.courses}: </span>
                  {student.courses.length ? student.courses.map((c) => c.title).join(", ") : <span className="text-muted-foreground">{t.noCourse}</span>}
                </span>
                <span className="col-start-1 flex flex-wrap gap-1 md:col-start-auto">
                  {student.active ? (
                    <Badge variant="outline" className="text-foreground">
                      {t.status.active}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">{t.status.inactive}</Badge>
                  )}
                  {student.active && !student.hasPassword && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {t.status.pendingPassword}
                    </Badge>
                  )}
                </span>
                <span className="col-start-1 text-sm text-muted-foreground md:col-start-auto md:text-right md:text-foreground">
                  <span className="md:sr-only">{t.columns.enrollments}: </span>
                  {student.enrollments}
                </span>
                <span className="col-start-2 row-span-5 row-start-1 justify-self-end md:col-start-auto md:row-span-1 md:row-start-auto">
                  <StudentActions student={student} courses={courses} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pagination page={result.page} pageCount={result.pageCount} href={href} />
    </div>
  );
}
