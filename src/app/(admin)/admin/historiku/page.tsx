import type { Metadata } from "next";
import { EmptyState, PageHeader, Pagination } from "@/components/admin/page-parts";
import { admin } from "@/i18n/admin";
import { formatDateTime } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { listAuditLog } from "@/server/queries/admin";

export const metadata: Metadata = { title: admin.history.title };

const t = admin.history;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function HistoryPage({ searchParams }: PageProps<"/admin/historiku">) {
  await requirePageUser("admin");
  const page = Math.max(1, Number(one((await searchParams).faqe)) || 1);
  const log = await listAuditLog(page);

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} intro={t.intro} />
      {log.items.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <ol className="divide-y rounded-md border bg-card">
          {log.items.map((entry) => (
            <li key={entry.id} className="grid gap-1 px-4 py-3 text-sm transition-colors duration-200 hover:bg-muted/30 md:grid-cols-[12rem_1fr_12rem] md:gap-4">
              <time dateTime={entry.createdAt.toISOString()} className="text-muted-foreground">
                {formatDateTime(entry.createdAt)}
              </time>
              <div className="min-w-0">
                <p className="font-medium">{t.actions[entry.action] ?? entry.action}</p>
                <p className="truncate text-muted-foreground">
                  {t.targets[entry.targetType] ?? entry.targetType}
                  {entry.targetName ? `: ${entry.targetName}` : ""}
                </p>
              </div>
              <p className="text-muted-foreground md:text-right">
                {entry.actorName ?? (entry.hasActor ? t.deletedUser : t.system)}
              </p>
            </li>
          ))}
        </ol>
      )}
      <Pagination page={log.page} pageCount={log.pageCount} href={(p) => (p > 1 ? `/admin/historiku?faqe=${p}` : "/admin/historiku")} />
    </div>
  );
}
