import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/admin/page-parts";
import { admin } from "@/i18n/admin";
import { formatDateTime } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { getIntegrationStatus } from "@/server/queries/admin";

export const metadata: Metadata = { title: admin.integrations.title };

const t = admin.integrations;

function State({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <span className={`inline-flex items-center gap-1.5 ${ok ? "text-foreground" : "text-destructive"}`}>
      <Icon className="size-4" aria-hidden /> {label}
    </span>
  );
}

export default async function IntegrationsPage() {
  await requirePageUser("admin");
  const status = await getIntegrationStatus();

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} intro={t.intro} />

      <SectionCard title={t.zoom}>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t.zoomMode}</dt>
            <dd>{status.zoom.mode === "demo" ? t.zoomDemo : t.zoomLive}</dd>
          </div>
          {status.zoom.mode === "demo" && <p className="font-medium">{t.zoomNotConfigured}</p>}
          <div>
            <dt className="text-muted-foreground">{t.zoomVars}</dt>
            <dd>
              <ul className="mt-1 space-y-1">
                {status.zoom.vars.map((v) => (
                  <li key={v.name} className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-xs">{v.name}</code>
                    <State ok={v.present} label={v.present ? t.present : t.missing} />
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title={t.storage}>
        <dl className="space-y-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{t.storageBucket}</dt>
            <dd>
              <code className="text-xs">{status.storage.bucket}</code>
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{t.storage}</dt>
            <dd>
              <State ok={status.storage.reachable} label={status.storage.reachable ? t.storageOk : t.storageFail} />
            </dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title={t.email}>
        <dl className="text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{t.smtpHost}</dt>
            <dd>
              <State ok={status.email.smtpConfigured} label={status.email.smtpConfigured ? `${t.smtpConfigured} (${status.email.smtpHost})` : t.smtpMissing} />
            </dd>
          </div>
        </dl>
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        {t.checkedAt} {formatDateTime(status.checkedAt)}
      </p>
    </div>
  );
}
