"use client";

import { useEffect, useState } from "react";
import { CalendarClock, MoreHorizontal, Plus, RotateCcw, UserMinus } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormField } from "@/components/admin/form-field";
import { EmptyState } from "@/components/admin/page-parts";
import { errorMessage, useApiAction } from "@/components/admin/use-api-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api/client";
import { ACADEMY_TIMEZONE_LABEL, formatDateTime, fromZonedInputValue, timezoneAbbreviation, toZonedInputValue } from "@/lib/datetime";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

const t = admin.roster;

export type RosterRow = {
  id: string;
  source: "ADMIN" | "INVITATION";
  student: { id: string; name: string; email: string };
  ownDeadline: Date | null;
  effectiveDeadline: Date;
  deadlineIsOwn: boolean;
  status: "ACTIVE" | "REVOKED" | "EXPIRED" | "INACTIVE_ACCOUNT";
};

const STATUS_TONE: Record<RosterRow["status"], "outline" | "destructive" | "secondary"> = {
  ACTIVE: "outline",
  REVOKED: "destructive",
  EXPIRED: "secondary",
  INACTIVE_ACCOUNT: "secondary",
};

const zoneLabel = (date: Date) => `${ACADEMY_TIMEZONE_LABEL}, ${timezoneAbbreviation(date)}`;

export function RosterPanel({ lessonId, lessonDeadline, rows }: { lessonId: string; lessonDeadline: Date; rows: RosterRow[] }) {
  return (
    <div className="space-y-6">
      <AddStudent lessonId={lessonId} />
      {rows.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{row.student.name}</p>
                <p className="truncate text-sm text-muted-foreground">{row.student.email}</p>
                <p className="text-xs text-muted-foreground">
                  {t.source[row.source]} · {t.columns.deadline}: {formatDateTime(row.effectiveDeadline)} ({zoneLabel(row.effectiveDeadline)}) —{" "}
                  {row.deadlineIsOwn ? t.ownDeadline : t.lessonDeadline}
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-center">
                <Badge variant={STATUS_TONE[row.status]}>{t.status[row.status]}</Badge>
                <RowActions lessonDeadline={lessonDeadline} row={row} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RowActions({ row, lessonDeadline }: { row: RosterRow; lessonDeadline: Date }) {
  const [dialog, setDialog] = useState<null | "revoke" | "deadline">(null);
  const { run, pending } = useApiAction();
  const url = `/admin/enrollments/${row.id}`;
  const revoked = row.status === "REVOKED";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`${t.columns.actions}: ${row.student.name}`} disabled={pending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onSelect={() => setDialog("deadline")}>
            <CalendarClock aria-hidden /> {t.deadline.action}
          </DropdownMenuItem>
          {revoked ? (
            <DropdownMenuItem onSelect={() => run(() => apiSend("patch", url, { revoked: false }), { success: t.restore.success })}>
              <RotateCcw aria-hidden /> {t.restore.action}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("revoke")}>
              <UserMinus aria-hidden /> {t.revoke.action}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmAction
        open={dialog === "revoke"}
        onOpenChange={(open) => setDialog(open ? "revoke" : null)}
        title={t.revoke.title}
        description={t.revoke.description(row.student.name)}
        confirmLabel={t.revoke.confirm}
        destructive
        onConfirm={() => run(() => apiSend("patch", url, { revoked: true }), { success: t.revoke.success })}
      />
      {dialog === "deadline" && <DeadlineDialog row={row} lessonDeadline={lessonDeadline} onClose={() => setDialog(null)} />}
    </>
  );
}

function DeadlineDialog({ row, lessonDeadline, onClose }: { row: RosterRow; lessonDeadline: Date; onClose: () => void }) {
  const [value, setValue] = useState(() => toZonedInputValue(row.ownDeadline ?? lessonDeadline));
  const [error, setError] = useState<string>();
  const { run, pending } = useApiAction();
  const url = `/admin/enrollments/${row.id}`;

  async function save() {
    const deadline = fromZonedInputValue(value);
    if (!deadline) return setError(admin.lessonForm.validation.date);
    const done = await run(() => apiSend("patch", url, { accessExpiresAt: deadline.toISOString() }), { success: t.deadline.saved });
    if (done) onClose();
  }

  async function clear() {
    const done = await run(() => apiSend("patch", url, { accessExpiresAt: null }), { success: t.deadline.cleared });
    if (done) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.deadline.title}</DialogTitle>
          <DialogDescription>
            {row.student.name} — {t.deadline.description}
          </DialogDescription>
        </DialogHeader>
        <FormField
          label={t.deadline.field}
          hint={`${t.lessonDeadline}: ${formatDateTime(lessonDeadline)} (${zoneLabel(lessonDeadline)})`}
          error={error}
        >
          <Input type="datetime-local" value={value} max={toZonedInputValue(lessonDeadline)} onChange={(e) => setValue(e.target.value)} />
        </FormField>
        <DialogFooter className="gap-2">
          {row.ownDeadline && (
            <Button variant="outline" onClick={clear} disabled={pending}>
              {t.deadline.clear}
            </Button>
          )}
          <Button onClick={save} disabled={pending}>
            {pending ? common.actions.loading : common.actions.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SearchResult = { id: string; name: string; email: string; enrollment: "ACTIVE" | "REVOKED" | null };

function AddStudent({ lessonId }: { lessonId: string }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; results: SearchResult[]; error?: string }>({ status: "idle", results: [] });
  const { run, pending } = useApiAction();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, status: "loading" }));
      apiGet<SearchResult[]>(`/admin/lessons/${lessonId}/student-search`, { q })
        .then((results) => !cancelled && setState({ status: "done", results }))
        .catch((error) => !cancelled && setState({ status: "error", results: [], error: errorMessage(error) }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, lessonId]);

  async function add(student: SearchResult) {
    const done = await run(() => apiSend("post", `/admin/lessons/${lessonId}/enrollments`, { userId: student.id }), { success: t.add.success(student.name) });
    if (done) setQuery("");
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <h3 className="font-sans text-sm font-medium">{t.add.title}</h3>
      <FormField label={t.add.searchLabel}>
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.add.searchPlaceholder} autoComplete="off" />
      </FormField>
      <SearchResults state={query.trim().length < 2 ? { status: "idle", results: [] } : state} pending={pending} onAdd={add} />
    </div>
  );
}

function SearchResults({
  state,
  pending,
  onAdd,
}: {
  state: { status: "idle" | "loading" | "done" | "error"; results: SearchResult[]; error?: string };
  pending: boolean;
  onAdd: (student: SearchResult) => void;
}) {
  return (
      <div aria-live="polite" className="text-sm">
        {state.status === "loading" && <p className="text-muted-foreground">{t.add.searching}</p>}
        {state.status === "error" && <p className="text-destructive">{state.error}</p>}
        {state.status === "done" && state.results.length === 0 && <p className="text-muted-foreground">{t.add.noResults}</p>}
        {state.status === "done" && state.results.length > 0 && (
          <ul className="divide-y rounded-md border">
            {state.results.map((student) => (
              <li key={student.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{student.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{student.email}</p>
                </div>
                {student.enrollment === "ACTIVE" ? (
                  <span className="text-xs text-muted-foreground">{t.add.already}</span>
                ) : (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => onAdd(student)}>
                    {student.enrollment === "REVOKED" ? <RotateCcw aria-hidden /> : <Plus aria-hidden />}
                    {student.enrollment === "REVOKED" ? t.restore.action : t.add.add}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
  );
}
