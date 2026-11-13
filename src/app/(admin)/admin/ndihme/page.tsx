import type { Metadata } from "next";
import Link from "next/link";
import { Check, ListChecks } from "lucide-react";
import { HelpGuide } from "@/components/admin/help-guide";
import { PageHeader, SectionCard } from "@/components/admin/page-parts";
import { Button } from "@/components/ui/button";
import { helpText } from "@/i18n/help";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getSetupChecklist } from "@/server/queries/help";

export const metadata: Metadata = { title: helpText.title };

const t = helpText;

/** The teacher's guide: a "first steps" checklist ticked from real data, then every task, searchable. */
export default async function HelpPage() {
  const admin = await requirePageUser("admin");
  const checklist = await getSetupChecklist(admin.id);
  const done = checklist.filter((item) => item.done).length;
  const allDone = done === checklist.length;

  return (
    <div className="space-y-8">
      <PageHeader title={t.title} intro={t.intro} />

      <SectionCard title={t.checklist.title} description={allDone ? t.checklist.allDone : t.checklist.intro} icon={ListChecks}>
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground tabular-nums">{t.checklist.progress(done, checklist.length)}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-gradient-to-r from-rose/70 to-rose-deep transition-[width] duration-700" style={{ width: `${(done / checklist.length) * 100}%` }} />
          </div>
        </div>
        {!allDone && (
          <ol className="stagger divide-y">
            {checklist.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full ring-1",
                    item.done ? "bg-rose text-primary-foreground ring-rose" : "text-transparent ring-border",
                  )}
                >
                  <Check className="size-3.5" />
                </span>
                <span className={cn("min-w-0 flex-1 text-sm", item.done && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                  <span className="sr-only">{item.done ? "✓ " : ""}</span>
                  {t.checklist.items[item.id]}
                </span>
                {!item.done && (
                  <span className="flex gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`#${item.guideId}`}>{t.checklist.show}</a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={item.href}>{t.checklist.open}</Link>
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      <HelpGuide />
    </div>
  );
}
