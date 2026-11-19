"use client";

import { BookOpen, MessageCircle, PartyPopper } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { openChats } from "@/hooks/use-chat";
import { portalText } from "@/i18n/portal";
import type { ClassroomData } from "@/server/queries/portal";
import { EmptyState } from "./empty-state";
import { MaterialsPanel } from "./materials-panel";
import { StudyProgress } from "./study-progress";

const t = portalText.offline;
const info = portalText.info;

/**
 * An offline (self-study) lesson: no class to join, so the page is built around its materials,
 * shown as numbered steps with the student's progress. Phones: progress, steps, then the
 * lesson's description; computers: the steps beside a sticky column with the description and help.
 */
export function StudyRoom({ data }: { data: ClassroomData }) {
  const { lesson, materials } = data;
  // Opened in this visit: marked right away (the server already saved it; the next refresh agrees).
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const items = materials.map((m) => ({ ...m, seen: m.seen || opened.has(m.id) }));
  // What can't be opened at all (an Office file without downloads) doesn't count.
  const openable = items.filter((m) => m.viewable || m.downloadable);
  const seen = openable.filter((m) => m.seen).length;
  const done = openable.length > 0 && seen >= openable.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="grid min-w-0 gap-6">
        <section aria-labelledby="study-progress" className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6">
          {done ? (
            <div className="flex items-start gap-3">
              <PartyPopper aria-hidden="true" className="mt-1 size-5 shrink-0 text-rose-deep" />
              <div>
                <h2 id="study-progress" className="text-2xl">
                  {t.doneTitle}
                </h2>
                <p className="text-sm text-muted-foreground">{t.doneBody}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <BookOpen aria-hidden="true" className="mt-1 size-5 shrink-0 text-rose-deep" />
              <div>
                <h2 id="study-progress" className="text-2xl">
                  {t.progressLabel}
                </h2>
                <p className="text-sm text-muted-foreground">{t.intro}</p>
              </div>
            </div>
          )}
          <StudyProgress seen={seen} total={openable.length} />
        </section>

        <section aria-labelledby="study-steps" className="grid gap-3">
          <h2 id="study-steps" className="text-2xl">
            {t.stepsTitle}
          </h2>
          {items.length ? (
            <MaterialsPanel lessonId={lesson.id} materials={items} steps onOpened={(id) => setOpened((prev) => new Set(prev).add(id))} />
          ) : (
            <EmptyState icon={BookOpen} title={t.emptyTitle}>
              {t.emptyBody}
            </EmptyState>
          )}
        </section>
      </div>

      <aside className="grid gap-4 lg:sticky lg:top-24">
        {lesson.summary || lesson.details ? (
          <section aria-labelledby="study-about" className="grid gap-2 rounded-xl border bg-card p-4 text-sm sm:p-5">
            <h2 id="study-about" className="text-xl">
              {t.aboutTitle}
            </h2>
            {lesson.summary ? <p className="whitespace-pre-line">{lesson.summary}</p> : null}
            {lesson.details ? <p className="whitespace-pre-line text-muted-foreground">{lesson.details}</p> : null}
          </section>
        ) : null}
        <section aria-labelledby="study-help" className="grid gap-3 rounded-xl border border-dashed p-4 text-sm sm:p-5">
          <div>
            <h2 id="study-help" className="text-xl">
              {t.helpTitle}
            </h2>
            <p className="text-muted-foreground">{t.helpBody}</p>
          </div>
          <Button variant="outline" size="lg" className="w-full sm:w-fit lg:w-full" onClick={() => openChats()}>
            <MessageCircle aria-hidden="true" />
            {t.helpAction}
          </Button>
        </section>
        <p className="text-xs text-muted-foreground">{info.timezoneNote}</p>
      </aside>
    </div>
  );
}
