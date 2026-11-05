import { Badge } from "@/components/ui/badge";
import { admin } from "@/i18n/admin";
import { formatMinutes } from "@/lib/attendance";
import { formatTime } from "@/lib/datetime";
import type { getLessonAttendance } from "@/server/services/attendance";

const t = admin.attendance;

type Attendance = Awaited<ReturnType<typeof getLessonAttendance>>;
type Row = Attendance["attended"][number];

/** Who came to the live class (with their time), who didn't, and anyone else who was in it. */
export function AttendancePanel({ attendance }: { attendance: Attendance }) {
  if (!attendance.hasData) return <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{t.empty}</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t.intro}</p>
      <p className="font-medium">{t.summary(attendance.attended.length, attendance.enrolledCount)}</p>

      {attendance.attended.length > 0 && <PeopleList title={t.attended} rows={attendance.attended} />}

      {attendance.absent.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            {t.absent} ({attendance.absent.length})
          </h3>
          <ul className="flex flex-wrap gap-2">
            {attendance.absent.map((student) => (
              <li key={student.userId}>
                <Badge variant="outline">{student.name}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attendance.others.length > 0 && <PeopleList title={t.others} hint={t.othersHint} rows={attendance.others} />}
    </div>
  );
}

function PeopleList({ title, hint, rows }: { title: string; hint?: string; rows: Row[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        {title} ({rows.length})
      </h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <ul className="divide-y rounded-md border">
        {rows.map((row) => (
          <li key={`${row.userId ?? row.name}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{row.name}</p>
              <p className="text-xs text-muted-foreground">
                {t.joinedAt(formatTime(row.firstJoinedAt))}
                {row.lastLeftAt ? ` · ${t.leftAt(formatTime(row.lastLeftAt))}` : ""} · {t.joins(row.joins)}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {!row.lastLeftAt && <Badge className="bg-live text-white">{t.stillIn}</Badge>}
              <span className="tabular-nums">
                <span className="sr-only">{t.time}: </span>
                {formatMinutes(row.minutes)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
