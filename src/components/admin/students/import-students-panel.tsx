"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api, apiSend } from "@/lib/api/client";
import { errorMessage } from "@/components/admin/use-api-action";
import { fieldInfo } from "@/i18n/field-info";

type ImportRow = {
  rowNumber: number;
  emri: string;
  email: string;
  abonimi: string[];
  profile: { phone: string; birthDate: string; gender: string; city: string; notes: string };
  issues: { field: string; message: string }[];
};
type Course = { id: string; title: string };
type ImportResult = { row: number; email: string; status: "created" | "failed" | "skipped"; fields?: string[]; reason?: string; mailSent?: boolean; lessonsAdded?: number };

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
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [rowResults, setRowResults] = useState<ImportResult[]>([]);
  const courseMap = useMemo(() => new Map(courses.map((course) => [courseKey(course.title), course])), [courses]);

  const unmatched = [...new Set(students.flatMap((student) => student.abonimi))]
    .filter((name) => !courseMap.has(courseKey(name)));
  const repeatedEmails = new Set(
    students.map((student) => student.email).filter((email, index, values) => values.indexOf(email) !== index),
  );
  const repeatedEmailRows = new Set(students.flatMap((student, index) => students.findIndex((row) => row.email === student.email) < index ? [index] : []));

  function fieldIssue(student: ImportRow, field: string) {
    const result = rowResults.find((item) => item.row === student.rowNumber);
    if (result?.fields?.includes(field)) return result.reason ?? "Ka një problem në këtë fushë.";
    const previewIssue = student.issues.find((issue) => issue.field === field);
    if (previewIssue) return previewIssue.message;
    const index = students.indexOf(student);
    if (field === "email" && repeatedEmailRows.has(index)) return "Emaili përsëritet në skedar dhe do të anashkalohet.";
    if (field === "abonimi" && student.abonimi.some((name) => !courseMap.has(courseKey(name)))) return "Kursi nuk u gjet.";
    return undefined;
  }

  function cellClass(student: ImportRow, field: string) {
    return fieldIssue(student, field) ? "bg-destructive/10 ring-1 ring-inset ring-destructive" : "";
  }

  async function previewFile(file?: File) {
    setError("");
    setStudents([]);
    setRowResults([]);
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

  /** Through the API client: the route needs the Bearer token, which a plain link wouldn't send. */
  async function downloadTemplate() {
    setDownloading(true);
    try {
      const response = await api.get<Blob>("/admin/students/import/template", { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "studentet-shablloni.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDownloading(false);
    }
  }

  async function importStudents() {
    setError("");
    setRowResults([]);
    setImporting(true);
    try {
      const result = await apiSend<{
        created: number;
        results: ImportResult[];
      }>("post", "/admin/students/import", { students, addToUpcoming });
      setRowResults(result.results);
      const failed = result.results.filter((student) => student.status === "failed");
      const skipped = result.results.filter((student) => student.status === "skipped");
      const mailFailed = result.results.filter((student) => student.status === "created" && !student.mailSent);
      toast[failed.length ? "warning" : "success"](`${result.created} u krijuan; ${skipped.length} u anashkaluan; ${failed.length} dështuan.${mailFailed.length ? ` Emaili nuk u dërgua për: ${mailFailed.map(({ email }) => email).join(", ")}.` : ""}`);
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
      <Button type="button" variant="outline" size="sm" onClick={() => void downloadTemplate()} disabled={downloading}>
        {downloading ? <Loader2 aria-hidden className="animate-spin" /> : <Download aria-hidden />} Shkarko shabllonin Excel
      </Button>
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
                {students.map((student) => {
                  const result = rowResults.find((item) => item.row === student.rowNumber);
                  const rowIssue = result?.status === "failed" && !result.fields?.length;
                  return <tr key={`${student.rowNumber}-${student.email}`} className={`border-t align-top ${rowIssue ? "bg-destructive/10" : ""}`}>
                    <td className={`p-2 ${cellClass(student, "emri")}`} title={fieldIssue(student, "emri")}><MarqueeText text={student.emri || "?"} /></td>
                    <td className={`p-2 ${cellClass(student, "email")}`} title={fieldIssue(student, "email")}><MarqueeText text={student.email || "?"} /></td>
                    <td className={`p-2 ${cellClass(student, "phone")}`} title={fieldIssue(student, "phone")}><MarqueeText text={student.profile.phone || "?"} /></td>
                    <td className={`p-2 ${cellClass(student, "birthDate")}`} title={fieldIssue(student, "birthDate")}><MarqueeText text={student.profile.birthDate || "?"} /></td>
                    <td className={`p-2 ${cellClass(student, "gender")}`} title={fieldIssue(student, "gender")}><MarqueeText text={student.profile.gender || "?"} /></td>
                    <td className={`p-2 ${cellClass(student, "city")}`} title={fieldIssue(student, "city")}><MarqueeText text={student.profile.city || "?"} /></td>
                    <td className={`p-2 ${cellClass(student, "notes")}`} title={fieldIssue(student, "notes")}><MarqueeText text={student.profile.notes || "?"} /></td>
                    <td className={`p-2 ${cellClass(student, "abonimi")}`} title={fieldIssue(student, "abonimi")}><MarqueeText text={student.abonimi.join(", ") || "?"} /></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          {students.some((student) => student.issues.length > 0) && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="max-h-36 overflow-y-auto list-inside list-disc space-y-1 pr-2">
                  {students.flatMap((student) => student.issues.map((issue, index) => (
                    <li key={`${student.rowNumber}-${issue.field}-${index}`}>Rreshti {student.rowNumber}, {issue.field}: {issue.message}</li>
                  )))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm">U gjetën {students.length} studentë.</p>
          {repeatedEmails.size > 0 && (
            <Alert><AlertDescription className="max-h-24 overflow-y-auto break-words">Emaili përsëritet në skedar; pas rreshtit të parë do të anashkalohet: {[...repeatedEmails].join(", ")}.</AlertDescription></Alert>
          )}
          {unmatched.length > 0 && (
            <Alert variant="destructive"><AlertDescription className="max-h-24 overflow-y-auto break-words">Abonimet nuk përputhen me kurset: {unmatched.join(", ")}.</AlertDescription></Alert>
          )}
          <div className="flex items-start gap-2">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={addToUpcoming} onCheckedChange={(checked) => setAddToUpcoming(checked === true)} />
              <span>Shtoji edhe në mësimet e ardhshme të kurseve të tyre</span>
            </label>
            <InfoTip label="Mësimet e ardhshme" className="mt-0.5">{fieldInfo.toggles.addToUpcoming}</InfoTip>
          </div>
          {rowResults.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 text-sm" role="status" aria-live="polite">
              {rowResults.map((result) => (
                <p key={`${result.row}-${result.email}`} className={result.status === "failed" ? "rounded bg-destructive/10 p-2 text-destructive" : "text-muted-foreground"}>
                  Rreshti {result.row} ({result.email || "email i pavlefshëm"}): {result.status === "created" ? "u krijua" : result.status === "skipped" ? "u anashkalua" : "dështoi"}{result.reason ? ` — ${result.reason}` : ""}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={previewing || importing}>Kthehu</Button>
        <Button
          type="button"
          onClick={() => void importStudents()}
          disabled={!students.length || !!error || previewing || importing}
        >
          {importing ? "Duke krijuar llogaritë…" : `Krijo ${students.length || "studentët"}`}
        </Button>
      </div>
    </div>
  );
}
