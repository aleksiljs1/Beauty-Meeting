"use client";

import { useRef, useState } from "react";
import { Check, Copy, Link2, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormField } from "@/components/admin/form-field";
import { EmptyState } from "@/components/admin/page-parts";
import { useApiAction } from "@/components/admin/use-api-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiSend } from "@/lib/api/client";
import { ACADEMY_TIMEZONE_LABEL, formatDateTime, fromZonedInputValue, timezoneAbbreviation, toZonedInputValue } from "@/lib/datetime";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

const t = admin.invitations;

export type InvitationRow = {
  id: string;
  createdAt: Date;
  redeemUntil: Date;
  accessExpiresAt: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  status: "ACTIVE" | "REVOKED" | "EXPIRED" | "FULL";
};

const zone = (date: Date) => `(${ACADEMY_TIMEZONE_LABEL}, ${timezoneAbbreviation(date)})`;

export function InvitationsPanel({
  lesson,
  invitations,
}: {
  lesson: { id: string; publication: string; scheduledEndAt: Date; accessExpiresAt: Date };
  invitations: InvitationRow[];
}) {
  const { run, pending } = useApiAction();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">{t.intro}</p>
        <CreateInvitationDialog lesson={lesson} />
      </div>
      {lesson.publication !== "PUBLISHED" && (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertDescription>{t.notPublished}</AlertDescription>
        </Alert>
      )}
      {invitations.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <ul className="divide-y rounded-md border">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link2 className="size-4 text-muted-foreground" aria-hidden />
                  <span className="font-medium">
                    {t.columns.created} {formatDateTime(inv.createdAt)}
                  </span>
                  <Badge variant={inv.status === "ACTIVE" ? "outline" : inv.status === "REVOKED" ? "destructive" : "secondary"}>{t.status[inv.status]}</Badge>
                </div>
                <p className="text-muted-foreground">
                  {t.columns.uses}: {inv.redemptionCount} / {inv.maxRedemptions ?? t.unlimited} · {t.columns.validUntil} {formatDateTime(inv.redeemUntil)}{" "}
                  {zone(inv.redeemUntil)}
                </p>
                <p className="text-muted-foreground">
                  {t.columns.access}: {inv.accessExpiresAt ? `${formatDateTime(inv.accessExpiresAt)} ${zone(inv.accessExpiresAt)}` : t.lessonDeadline}
                </p>
              </div>
              {inv.status !== "REVOKED" && (
                <ConfirmAction
                  trigger={
                    <Button variant="outline" size="sm" disabled={pending} className="self-start sm:self-center">
                      {t.revoke.action}
                    </Button>
                  }
                  title={t.revoke.title}
                  description={t.revoke.description}
                  confirmLabel={t.revoke.confirm}
                  destructive
                  onConfirm={() => run(() => apiSend("post", `/admin/invitations/${inv.id}/revoke`), { success: t.revoke.success })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function defaultRedeemUntil(lesson: { scheduledEndAt: Date; accessExpiresAt: Date }) {
  const now = Date.now();
  return lesson.scheduledEndAt.getTime() > now ? lesson.scheduledEndAt : lesson.accessExpiresAt;
}

function CreateInvitationDialog({ lesson }: { lesson: { id: string; scheduledEndAt: Date; accessExpiresAt: Date } }) {
  const [open, setOpen] = useState(false);
  const [max, setMax] = useState("");
  const [redeemUntil, setRedeemUntil] = useState(() => toZonedInputValue(defaultRedeemUntil(lesson)));
  const [accessUntil, setAccessUntil] = useState("");
  const [errors, setErrors] = useState<{ max?: string; redeemUntil?: string; accessUntil?: string }>({});
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const { run, pending } = useApiAction();

  function reset() {
    setMax("");
    setRedeemUntil(toZonedInputValue(defaultRedeemUntil(lesson)));
    setAccessUntil("");
    setErrors({});
    setLink(null);
    setCopied(false);
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) reset(); // the link is never shown again after closing
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const maxValue = max.trim() ? Number(max) : null;
    if (maxValue !== null && (!Number.isInteger(maxValue) || maxValue < 1 || maxValue > 1000)) nextErrors.max = t.validation.max;
    const until = fromZonedInputValue(redeemUntil);
    if (!until) nextErrors.redeemUntil = admin.lessonForm.validation.date;
    const access = accessUntil ? fromZonedInputValue(accessUntil) : null;
    if (accessUntil && !access) nextErrors.accessUntil = admin.lessonForm.validation.date;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !until) return;

    const created = await run(
      () =>
        apiSend<{ id: string; url: string }>("post", `/admin/lessons/${lesson.id}/invitations`, {
          maxRedemptions: maxValue,
          redeemUntil: until.toISOString(),
          accessExpiresAt: access ? access.toISOString() : null,
        }),
      {},
    );
    if (created) setLink(created.url);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      linkInput.current?.select();
      setCopied(false);
      toast.error(t.copyFailed);
    }
  }

  const lessonMax = toZonedInputValue(lesson.accessExpiresAt);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> {t.create}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>{t.onceTitle}</DialogTitle>
              <DialogDescription>{t.onceBody}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="invitation-link">{t.linkLabel}</Label>
              <div className="flex gap-2">
                <Input id="invitation-link" ref={linkInput} readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                <Button type="button" onClick={copy} aria-label={common.actions.copy}>
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  <span className="hidden sm:inline">{copied ? common.actions.copied : common.actions.copy}</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {copied ? t.copied : ""}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => changeOpen(false)}>
                {common.actions.close}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t.createTitle}</DialogTitle>
              <DialogDescription>{t.intro}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <FormField label={t.maxRedemptions} hint={t.maxRedemptionsHint} error={errors.max}>
                <Input type="number" min={1} max={1000} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} />
              </FormField>
              <FormField label={t.redeemUntil} hint={`${t.redeemUntilHint} ${zone(lesson.accessExpiresAt)}`} error={errors.redeemUntil}>
                <Input type="datetime-local" value={redeemUntil} max={lessonMax} onChange={(e) => setRedeemUntil(e.target.value)} />
              </FormField>
              <FormField label={t.accessExpiresAt} hint={t.accessExpiresAtHint} error={errors.accessUntil}>
                <Input type="datetime-local" value={accessUntil} max={lessonMax} onChange={(e) => setAccessUntil(e.target.value)} />
              </FormField>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                  {common.actions.cancel}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? common.actions.loading : t.submit}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

