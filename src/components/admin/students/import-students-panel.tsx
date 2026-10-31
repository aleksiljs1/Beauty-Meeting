"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api, apiSend } from "@/lib/api/client";
import { errorMessage } from "@/components/admin/use-api-action";

type ImportRow = {
  emri: string;
  email: string;
  abonimi: string[];
  profile: { phone: string; birthDate: string; gender: string; city: string; notes: string };
};
type Course = { id: string; title: string };

function MarqueeText({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div ref={ref} className={`student-import-marquee${overflows ? " student-import-marquee--overflow" : ""}`} title={text}>
      {overflows ? (
        <div className="student-import-marquee__track"><span>{text}</span><span aria-hidden="true">{text}</span></div>
      ) : (
        <span className="student-import-marquee__text">{text}</span>
      )}
    </div>
  );
}

function courseKey(value: string) {
  return value.trim().normalize("NFKC").toLowerCase();
}

export function ImportStudentsPanel({
  courses,
  onCancel,
  onImported,
}: {
  courses: Course[];
  onCancel: () => void;
  onImported: () => void;
}) {
  const [students, setStudents] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [addToUpcoming, setAddToUpcoming] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const courseMap = useMemo(() => new Map(courses.map((course) => [courseKey(course.title), course])), [courses]);

  const unmatched = [...new Set(students.flatMap((student) => student.abonimi))]
    .filter((name) => !courseMap.has(courseKey(name)));
  const repeatedEmails = new Set(
    students.map((student) => student.email).filter((email, index, values) => values.indexOf(email) !== index),
  );

  async function previewFile(file?: File) {
    setError("");
    setStudents([]);
    setFileName("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Zgjidhni një skedar Excel me prapashtesën .xlsx.");
      return;
    }

    const body = new FormData();
    body.append("file", file);
    setPreviewing(true);
    try {
      const response = await api.post<{ data: { students: ImportRow[] } }>("/admin/students/import/preview", body);
      setStudents(response.data.data.students);
      setFileName(file.name);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPreviewing(false);
    }
  }

  async function importStudents() {
    setError("");
    setImporting(true);
    try {
      const result = await apiSend<{
        created: number;
        results: { email: string; mailSent: boolean; lessonsAdded: number }[];
      }>("post", "/admin/students/import", { students, addToUpcoming });
      const failedEmails = result.results.filter((student) => !student.mailSent).map((student) => student.email);
      const lessonsAdded = result.results.reduce((total, student) => total + student.lessonsAdded, 0);
      const summary = `${result.created} llogari studenti u krijuan.${lessonsAdded ? ` U shtuan ${lessonsAdded} regjistrime në mësimet e ardhshme.` : ""}`;
      if (failedEmails.length) {
        toast.warning(`${summary} Emaili nuk u dërgua për: ${failedEmails.join(", ")}.`);
      } else {
        toast.success(`${summary} Emaili për vendosjen e fjalëkalimit u dërgua për të gjithë.`);
      }
      onImported();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <p className="max-w-full break-words text-sm text-muted-foreground">
        Ngarkoni .xlsx me kolonat <strong>Emrat</strong>, <strong>Email</strong> dhe <strong>Abonimet</strong>. Optional: Telefoni, Datelindja (DD/MM/YYYY), Gjinia, Qyteti, Shenime (max 100 chars).
        Ndani disa abonime me presje ose pikëpresje. Skedari lexohet vetëm në memorie.
      </p>
      <label className="flex w-full min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 text-sm hover:bg-muted/40">
        <FileSpreadsheet aria-hidden className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{fileName || "Zgjidhni skedarin Excel (.xlsx)"}</span>
        <Upload aria-hidden className="size-4 shrink-0" />
        <Input
          className="sr-only"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={previewing || importing}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void previewFile(file);
          }}
        />
      </label>

      {previewing && <p className="text-sm text-muted-foreground">Duke lexuar skedarin…</p>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {students.length > 0 && (
        <>
          <div className="w-full min-w-0 max-w-full max-h-64 overflow-auto rounded-lg border">
            <table className="student-import-table w-full min-w-[1160px] table-fixed text-left text-xs">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2">Emrat</th><th className="p-2">Email</th><th className="p-2">Telefoni</th>
                  <th className="p-2">Datëlindja</th><th className="p-2">Gjinia</th><th className="p-2">Qyteti</th>
                  <th className="p-2">Shënime</th><th className="p-2">Abonimet</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, index) => (
                  <tr key={`${student.email}-${index}`} className="border-t align-top">
                    <td className="p-2"><MarqueeText text={student.emri} /></td>
                    <td className="p-2"><MarqueeText text={student.email} /></td>
                    <td className="p-2"><MarqueeText text={student.profile.phone || "?"} /></td>
                    <td className="p-2"><MarqueeText text={student.profile.birthDate || "?"} /></td>
                    <td className="p-2"><MarqueeText text={student.profile.gender || "?"} /></td>
                    <td className="p-2"><MarqueeText text={student.profile.city || "?"} /></td>
                    <td className="p-2"><MarqueeText text={student.profile.notes || "?"} /></td>
                    <td className="p-2"><MarqueeText text={student.abonimi.join(", ") || "?"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm">U gjetën {students.length} studentë.</p>
          {repeatedEmails.size > 0 && (
            <Alert variant="destructive"><AlertDescription>Emaili përsëritet në skedar: {[...repeatedEmails].join(", ")}.</AlertDescription></Alert>
          )}
          {unmatched.length > 0 && (
            <Alert variant="destructive"><AlertDescription>Abonimet nuk përputhen me kurset: {unmatched.join(", ")}.</AlertDescription></Alert>
          )}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={addToUpcoming} onCheckedChange={(checked) => setAddToUpcoming(checked === true)} />
            <span>Shtoji edhe në mësimet e ardhshme të kurseve të tyre</span>
          </label>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={previewing || importing}>Kthehu</Button>
        <Button
          type="button"
          onClick={() => void importStudents()}
          disabled={!students.length || !!error || unmatched.length > 0 || repeatedEmails.size > 0 || previewing || importing}
        >
          {importing ? "Duke krijuar llogaritë…" : `Krijo ${students.length || "studentët"}`}
        </Button>
      </div>
    </div>
  );
}
