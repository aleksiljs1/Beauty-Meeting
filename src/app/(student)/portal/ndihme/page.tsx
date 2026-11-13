import type { Metadata } from "next";
import { ContactAcademy } from "@/components/portal/contact-academy";
import { portalText } from "@/i18n/portal";
import { requirePageUser } from "@/server/auth/session";

const t = portalText.help;

export const metadata: Metadata = { title: t.metaTitle };

/** Short answers for students: joining, camera and microphone, when Zoom fails, recordings, password. */
export default async function StudentHelpPage() {
  await requirePageUser("student");
  return (
    <div className="grid max-w-2xl gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl sm:text-4xl">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
      </div>
      {t.sections.map((section) => (
        <section key={section.title} className="grid gap-3 rounded-xl border bg-card p-5 sm:p-6">
          <h2 className="text-2xl">{section.title}</h2>
          <ol className="grid gap-2 text-sm">
            {section.steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-rose/15 text-xs font-medium text-rose-deep tabular-nums">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <ContactAcademy showHelpLink={false} />
    </div>
  );
}
