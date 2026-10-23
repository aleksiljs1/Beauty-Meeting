import type { Metadata } from "next";
import { PageHeader, SectionCard } from "@/components/admin/page-parts";
import { Badge } from "@/components/ui/badge";
import { helpText } from "@/i18n/help";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: helpText.title };

const t = helpText;

/** Static teacher guide for live classes. Untested behaviour is labelled as such. */
export default async function HelpPage() {
  await requirePageUser("admin");

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} intro={t.intro} />

      <nav aria-label={t.contents} className="rounded-md border bg-card p-4 text-sm">
        <h2 className="mb-2 font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.contents}</h2>
        <ol className="grid gap-1 sm:grid-cols-2">
          {t.sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-rose-deep underline-offset-4 hover:underline">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {t.sections.map((section) => (
        <div key={section.id} id={section.id} className="scroll-mt-20">
          <SectionCard title={section.title} description={"intro" in section ? section.intro : undefined}>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {section.items.map((item) => (
                <li key={item.text}>
                  {item.text}
                  {"untested" in item && item.untested && (
                    <Badge variant="outline" className="ml-2 align-middle text-muted-foreground">
                      {t.untested}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      ))}
    </div>
  );
}
