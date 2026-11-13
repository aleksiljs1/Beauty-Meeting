import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/admin/page-parts";
import { admin } from "@/i18n/admin";
import { formatDateTime } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { getIntegrationStatus } from "@/server/queries/admin";

export const metadata: Metadata = { title: admin.integrations.title };

const t = admin.integrations;

function State({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className="space-y-1 text-sm">
      <p className={`flex items-center gap-1.5 font-medium ${ok ? "text-foreground" : "text-destructive"}`}>
        <Icon className="size-4 shrink-0" aria-hidden /> {label}
      </p>
      {hint && <p className="text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Plain status for the owner; the setting names, bucket and mail server only under "technical details". */
export default async function IntegrationsPage() {
  await requirePageUser("admin");
  const status = await getIntegrationStatus();
  const live = status.zoom.mode === "live";

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} intro={t.intro} />

      <SectionCard title={t.zoom}>
        <State ok={live} label={live ? t.zoomLive : t.zoomDemo} hint={live ? t.zoomLiveHint : t.zoomDemoHint} />
      </SectionCard>

      <SectionCard title={t.storage}>
        <State ok={status.storage.reachable} label={status.storage.reachable ? t.storageOk : t.storageFail} hint={status.storage.reachable ? undefined : t.storageFailHint} />
      </SectionCard>

      <SectionCard title={t.email}>
        <State ok={status.email.smtpConfigured} label={status.email.smtpConfigured ? t.smtpConfigured : t.smtpMissing} hint={status.email.smtpConfigured ? undefined : t.smtpMissingHint} />
      </SectionCard>

      <details className="rounded-md border bg-card text-sm">
        <summary className="cursor-pointer px-4 py-3 text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{t.technical}</summary>
        <dl className="space-y-3 border-t px-4 py-3">
          <div>
            <dt className="text-muted-foreground">{t.zoomVars}</dt>
            <dd>
              <ul className="mt-1 space-y-1">
                {status.zoom.vars.map((v) => (
                  <li key={v.name} className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-xs">{v.name}</code>
                    <span className={v.present ? undefined : "text-destructive"}>{v.present ? t.present : t.missing}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{t.storageBucket}</dt>
            <dd>
              <code className="text-xs">{status.storage.bucket}</code>
            </dd>
          </div>
          {status.email.smtpHost && (
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">{t.smtpHost}</dt>
              <dd>
                <code className="text-xs">{status.email.smtpHost}</code>
              </dd>
            </div>
          )}
        </dl>
      </details>

      <p className="text-xs text-muted-foreground">
        {t.checkedAt} {formatDateTime(status.checkedAt)}
      </p>
    </div>
  );
}
