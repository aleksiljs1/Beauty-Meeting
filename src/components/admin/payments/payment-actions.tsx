"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { CalendarClock, History, MoreHorizontal, Plus } from "lucide-react";
import { z } from "zod";
import { FormField } from "@/components/admin/form-field";
import { errorMessage, useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";
import { apiGet, apiSend } from "@/lib/api/client";
import { centsToEuroInput, courseMonthLabel, formatEuro, parseEuroCents } from "@/lib/billing";
import { formatCalendarDate, todayInAcademy } from "@/lib/datetime";
import type { PaymentHistoryEntry } from "@/server/queries/payments";

const t = admin.payments;
const METHODS = ["CASH", "BANK", "OTHER"] as const;

export type PaymentActionsAccount = {
  courseId: string;
  courseTitle: string;
  userId: string;
  name: string;
  firstMonth: number;
  durationMonths: number;
  monthlyPriceCents: number | null;
  paidThroughMonth: number;
  monthsLeft: number;
};

const monthLabel = (month: number) => {
  const { year, month: m } = courseMonthLabel(month);
  return t.month(year, m);
};

export function PaymentActions({ account }: { account: PaymentActionsAccount }) {
  const [dialog, setDialog] = useState<null | "record" | "history" | "firstMonth">(null);
  const close = () => setDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${t.columns.actions}: ${account.name}`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={account.monthsLeft === 0} onSelect={() => setDialog("record")}>
            <Plus aria-hidden /> {t.record.open}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("history")}>
            <History aria-hidden /> {t.history.open}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("firstMonth")}>
            <CalendarClock aria-hidden /> {t.firstMonth.open}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "record" && <RecordPaymentDialog account={account} onClose={close} />}
      {dialog === "history" && <HistoryDialog account={account} onClose={close} />}
      {dialog === "firstMonth" && <FirstMonthDialog account={account} onClose={close} />}
    </>
  );
}

function AccountDialog({ title, account, onClose, children }: { title: string; account: PaymentActionsAccount; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t.record.description(account.name, account.courseTitle)}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const recordSchema = z.object({
  months: z.string().regex(/^[1-9]\d{0,2}$/, t.record.invalidMonths),
  amount: z.string().refine((value) => parseEuroCents(value) !== null, t.record.invalidAmount),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(METHODS),
  note: z.string().max(500),
});
type RecordValues = z.infer<typeof recordSchema>;

function RecordPaymentDialog({ account, onClose }: { account: PaymentActionsAccount; onClose: () => void }) {
  const { run } = useApiAction();
  const price = account.monthlyPriceCents;
  const priceFor = (months: number) => (price === null ? "" : centsToEuroInput(months * price));
  const form = useForm<RecordValues>({
    resolver: zodResolver(recordSchema),
    defaultValues: { months: "1", amount: priceFor(1), paidOn: todayInAcademy(), method: "CASH", note: "" },
  });
  const months = Math.min(Number(useWatch({ control: form.control, name: "months" })) || 0, account.monthsLeft);
  const from = account.paidThroughMonth + 1;

  const submit = form.handleSubmit(async (values) => {
    const result = await run(
      () =>
        apiSend("post", "/admin/payments", {
          courseId: account.courseId,
          userId: account.userId,
          months: Number(values.months),
          amountCents: parseEuroCents(values.amount),
          paidOn: values.paidOn,
          method: values.method,
          note: values.note || null,
        }),
      { success: t.record.success },
    );
    if (result) onClose();
  });

  return (
    <AccountDialog title={t.record.title} account={account} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t.record.months} error={form.formState.errors.months?.message}>
            <Input
              type="number"
              min={1}
              max={account.monthsLeft}
              {...form.register("months", {
                // Keep the amount in step with the months until the admin types their own.
                onChange: (event) => !form.formState.dirtyFields.amount && form.setValue("amount", priceFor(Number(event.target.value) || 0)),
              })}
            />
          </FormField>
          <FormField label={t.record.amount} error={form.formState.errors.amount?.message}>
            <Input inputMode="decimal" {...form.register("amount")} />
          </FormField>
        </div>
        <p className="text-sm text-muted-foreground">
          {months > 0 && t.record.covers(monthLabel(from), monthLabel(from + months - 1))}
          {price !== null && <span className="block text-xs">{t.record.amountHint(formatEuro(price))}</span>}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t.record.paidOn} error={form.formState.errors.paidOn?.message}>
            <Input type="date" max={todayInAcademy()} {...form.register("paidOn")} />
          </FormField>
          <Controller
            control={form.control}
            name="method"
            render={({ field }) => (
              <FormField label={t.record.method}>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {t.record.methods[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
        </div>
        <FormField label={t.record.note}>
          <Input {...form.register("note")} />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? common.actions.loading : t.record.submit}
          </Button>
        </DialogFooter>
      </form>
    </AccountDialog>
  );
}

function HistoryDialog({ account, onClose }: { account: PaymentActionsAccount; onClose: () => void }) {
  const [entries, setEntries] = useState<PaymentHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [version, setVersion] = useState(0);
  const { run, pending } = useApiAction();

  useEffect(() => {
    let current = true;
    apiGet<PaymentHistoryEntry[]>("/admin/payments", { courseId: account.courseId, userId: account.userId })
      .then((data) => current && setEntries(data))
      .catch((err: unknown) => current && setError(errorMessage(err)));
    return () => {
      current = false;
    };
  }, [account.courseId, account.userId, version]);

  async function cancel(id: string) {
    const result = await run(() => apiSend("post", `/admin/payments/${id}/cancel`, { reason }), { success: t.history.cancelSuccess });
    if (!result) return;
    setCancelling(null);
    setReason("");
    setVersion((v) => v + 1);
  }

  return (
    <AccountDialog title={t.history.title} account={account} onClose={onClose}>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !entries ? (
        <p className="text-sm text-muted-foreground">{common.actions.loading}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.history.empty}</p>
      ) : (
        <ul className="max-h-[60vh] divide-y overflow-y-auto text-sm">
          {entries.map((p) => (
            <li key={p.id} className="space-y-1 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className={p.cancelledAt ? "text-muted-foreground line-through" : "font-medium"}>
                  {formatEuro(p.amountCents)} · {t.months(p.months)}
                </span>
                <span className="text-muted-foreground">{formatCalendarDate(p.paidOn)}</span>
              </div>
              {p.fromMonth !== null && p.toMonth !== null && <p>{t.history.covers(monthLabel(p.fromMonth), monthLabel(p.toMonth))}</p>}
              <p className="text-xs text-muted-foreground">
                {[t.record.methods[p.method], p.note, p.recordedBy && t.history.recordedBy(p.recordedBy)].filter(Boolean).join(" · ")}
              </p>
              {p.cancelledAt && p.cancelReason && <p className="text-xs text-destructive">{t.history.cancelled(p.cancelReason)}</p>}
              {!p.cancelledAt &&
                (cancelling === p.id ? (
                  <div className="flex gap-2 pt-1">
                    <Input autoFocus aria-label={t.history.cancelReason} placeholder={t.history.cancelReason} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <Button variant="destructive" size="sm" disabled={pending || reason.trim().length < 3} onClick={() => cancel(p.id)}>
                      {t.history.cancelConfirm}
                    </Button>
                  </div>
                ) : (
                  <Button variant="link" size="sm" className="h-auto p-0 text-destructive" onClick={() => setCancelling(p.id)}>
                    {t.history.cancel}
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </AccountDialog>
  );
}

function FirstMonthDialog({ account, onClose }: { account: PaymentActionsAccount; onClose: () => void }) {
  const [firstMonth, setFirstMonth] = useState(String(account.firstMonth));
  const { run, pending } = useApiAction();
  const value = Number(firstMonth);
  const valid = Number.isInteger(value) && value >= 1 && value <= account.durationMonths;

  async function save() {
    const url = `/admin/courses/${account.courseId}/students/${encodeURIComponent(account.userId)}`;
    const result = await run(() => apiSend("patch", url, { firstMonth: value }), { success: t.firstMonth.success });
    if (result) onClose();
  }

  return (
    <AccountDialog title={t.firstMonth.title} account={account} onClose={onClose}>
      <p className="text-sm text-muted-foreground">{t.firstMonth.description}</p>
      <FormField label={t.firstMonth.label} hint={valid ? monthLabel(value) : undefined}>
        <Input type="number" min={1} max={account.durationMonths} value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {common.actions.cancel}
        </Button>
        <Button onClick={save} disabled={pending || !valid || value === account.firstMonth}>
          {pending ? common.actions.loading : common.actions.save}
        </Button>
      </DialogFooter>
    </AccountDialog>
  );
}
