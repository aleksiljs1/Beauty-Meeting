"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { admin } from "@/i18n/admin";

export const LESSON_TABS = ["detaje", "studentet", "ftesat", "materialet", "regjistrimet"] as const;
export type LessonTab = (typeof LESSON_TABS)[number];

const LABELS: Record<LessonTab, string> = {
  detaje: admin.lessons.tabs.details,
  studentet: admin.lessons.tabs.students,
  ftesat: admin.lessons.tabs.invitations,
  materialet: admin.lessons.tabs.materials,
  regjistrimet: admin.lessons.tabs.recordings,
};

/** Tabs whose selection is mirrored in `?tab=` (shareable, survives refresh) without a server round trip. */
export function LessonTabs({ initialTab, panels }: { initialTab: LessonTab; panels: Record<LessonTab, ReactNode> }) {
  const [tab, setTab] = useState<LessonTab>(initialTab);

  function select(value: string) {
    const next = LESSON_TABS.find((t) => t === value) ?? "detaje";
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.searchParams.delete("faqe");
    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={select} className="gap-6">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList variant="line" className="w-max">
          {LESSON_TABS.map((value) => (
            <TabsTrigger key={value} value={value} className="px-3">
              {LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {LESSON_TABS.map((value) => (
        <TabsContent key={value} value={value} className="space-y-6">
          {panels[value]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
