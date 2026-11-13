import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PrintButton } from "@/components/admin/print-button";
import { admin } from "@/i18n/admin";
import { courseMonthLabel, formatEuro } from "@/lib/billing";
import { formatCalendarDate } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { getPaymentReceipt } from "@/server/queries/payments";
import { getPublicSettings } from "@/server/queries/public";

const t = admin.payments.receipt;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const monthLabel = (month: number) => {
  const { year, month: m } = courseMonthLabel(month);
  return admin.payments.month(year, m);
};

export const metadata: Metadata = { title: t.title };

/** A printable confirmation of one recorded payment (not a tax invoice). */
export default async function ReceiptPage({ params }: PageProps<"/admin/pagesat/deshmi/[id]">) {
  await requirePageUser("admin");
  const { id } = await params;
  const [receipt, academy] = await Promise.all([UUID.test(id) ? getPaymentReceipt(id) : null, getPublicSettings()]);
  if (!receipt) notFound();

  const rows: [string, string | null][] = [
    [t.student, `${receipt.studentName} (${receipt.studentEmail})`],
    [t.course, receipt.courseTitle],
    [t.covers, receipt.fromMonth !== null && receipt.toMonth !== null ? admin.payments.history.covers(monthLabel(receipt.fromMonth), monthLabel(receipt.toMonth)) : admin.payments.months(receipt.months)],
    [t.amount, formatEuro(receipt.amountCents)],
    [t.paidOn, formatCalendarDate(receipt.paidOn)],
    [t.method, admin.payments.record.methods[receipt.method]],
    [t.note, receipt.note],
    [t.recordedBy, receipt.recordedBy],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/admin/pagesat" className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
          <ChevronLeft aria-hidden className="size-4" /> {t.back}
        </Link>
        <PrintButton label={t.print} />
      </div>

      <article className="space-y-8 rounded-md border bg-card p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div>
            <p className="font-heading text-2xl">{academy.name}</p>
            <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{[academy.address, academy.phone, academy.email].filter(Boolean).join("\n")}</p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl">{t.title}</h1>
            <p className="text-sm text-muted-foreground tabular-nums">{t.number(receipt.id.slice(-8).toUpperCase())}</p>
          </div>
        </header>

        {receipt.cancelledAt && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{t.cancelled(receipt.cancelReason ?? "")}</p>}

        <dl className="grid gap-3 text-sm sm:grid-cols-[12rem_1fr]">
          {rows
            .filter((row): row is [string, string] => !!row[1])
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
        </dl>

        <footer className="grid gap-10 border-t pt-6 text-sm sm:grid-cols-2">
          <p className="text-muted-foreground">{t.disclaimer}</p>
          <p className="self-end border-t border-foreground/40 pt-2 text-center text-muted-foreground">{t.signature}</p>
        </footer>
      </article>
    </div>
  );
}
