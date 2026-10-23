"use client";

import { ArrowLeft } from "lucide-react";
import { useCallback, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";
import { cn } from "@/lib/utils";
import type { ClassroomData } from "@/server/queries/portal";
import { ClassroomStage } from "./classroom-stage";
import { LessonInfo } from "./lesson-info";
import { MaterialsPanel } from "./materials-panel";
import { RecordingsPanel } from "./recordings-panel";

const t = portalText.lesson;

export type PanelTab = "materials" | "info" | "recordings";
type MobileView = "classroom" | PanelTab;

const PANEL_TABS: { id: PanelTab; label: string; mobileLabel: string }[] = [
  { id: "materials", label: t.tabs.materials, mobileLabel: t.tabs.materials },
  { id: "info", label: t.tabs.info, mobileLabel: t.tabs.infoShort },
  { id: "recordings", label: t.tabs.recordings, mobileLabel: t.tabs.recordings },
];
const MOBILE_TABS: { id: MobileView; label: string }[] = [{ id: "classroom", label: t.tabs.classroom }, ...PANEL_TABS.map((p) => ({ id: p.id, label: p.mobileLabel }))];

const DESKTOP_QUERY = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
/** True at ≥1024px, where stage and panel are visible side by side. */
function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/** Arrow-key navigation for a tablist of buttons. */
function onTabKeyDown<T extends string>(event: KeyboardEvent, ids: T[], current: T, select: (id: T) => void, prefix: string) {
  const index = ids.indexOf(current);
  let next = -1;
  if (event.key === "ArrowRight") next = (index + 1) % ids.length;
  else if (event.key === "ArrowLeft") next = (index - 1 + ids.length) % ids.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = ids.length - 1;
  if (next < 0) return;
  event.preventDefault();
  select(ids[next]);
  document.getElementById(`${prefix}-${ids[next]}`)?.focus();
}

/**
 * Classroom layout. The stage and the side panel are SIBLINGS: panel state (tab, open PDF,
 * player) lives here and is never passed to the stage, and the stage is never re-keyed, so it
 * stays mounted while students browse materials. On phones (<1024px) the stage is hidden with
 * CSS — not unmounted — when a panel tab is shown.
 */
export function Classroom({ data, autoJoin, initialTab }: { data: ClassroomData; autoJoin: boolean; initialTab: PanelTab }) {
  const { lesson } = data;
  const [panelTab, setPanelTab] = useState<PanelTab>(initialTab);
  const [mobileView, setMobileView] = useState<MobileView>(initialTab === "recordings" ? "recordings" : "classroom");
  const [viewerOpen, setViewerOpen] = useState(false);
  const isDesktop = useIsDesktop();

  const showPanelTab = useCallback((tab: PanelTab) => {
    setPanelTab(tab);
    setMobileView(tab);
  }, []);
  const showRecordings = useCallback(() => showPanelTab("recordings"), [showPanelTab]);
  const selectMobile = (view: MobileView) => {
    setMobileView(view);
    if (view !== "classroom") setPanelTab(view);
  };

  return (
    <div className="grid gap-4">
      {/* Phones/tablets: one view at a time. */}
      <div
        role="tablist"
        aria-label={t.mobileTabsLabel}
        className="sticky top-14 z-20 -mx-4 grid grid-cols-4 gap-1 border-b bg-background/95 px-4 py-2 backdrop-blur-sm lg:hidden"
      >
        {MOBILE_TABS.map((tab) => {
          const selected = mobileView === tab.id;
          return (
            <button
              key={tab.id}
              id={`mtab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={tab.id === "classroom" ? "classroom-stage" : "classroom-panel"}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectMobile(tab.id)}
              onKeyDown={(e) =>
                onTabKeyDown(
                  e,
                  MOBILE_TABS.map((m) => m.id),
                  mobileView,
                  selectMobile,
                  "mtab",
                )
              }
              className={cn(
                "h-9 truncate rounded-md px-1 text-xs font-medium sm:text-sm",
                selected ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className={cn("grid items-start gap-6", viewerOpen ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_24rem]")}>
        <div id="classroom-stage" className={cn(mobileView !== "classroom" && "max-lg:hidden")}>
          <ClassroomStage
            lessonId={lesson.id}
            lessonTitle={lesson.title}
            stage={data.stage}
            canJoin={data.canJoin}
            joinBlockedMessage={data.joinBlockedMessage}
            zoomAppFallback={data.zoomAppFallback}
            scheduledStartAt={lesson.scheduledStartAt}
            joinOpensAt={lesson.joinOpensAt}
            serverTime={data.serverTime}
            hasRecordings={data.recordings.length > 0}
            autoJoin={autoJoin}
            onShowRecordings={showRecordings}
          />
        </div>

        <aside id="classroom-panel" aria-label={t.panelTabsLabel} className={cn("grid gap-3", mobileView === "classroom" && "max-lg:hidden")}>
          <Button variant="secondary" size="lg" className="h-10 justify-start lg:hidden" onClick={() => selectMobile("classroom")}>
            <ArrowLeft aria-hidden="true" />
            {t.backToClass}
          </Button>

          <div role="tablist" aria-label={t.panelTabsLabel} className="hidden rounded-lg bg-muted p-1 lg:grid lg:grid-cols-3">
            {PANEL_TABS.map((tab) => {
              const selected = panelTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`ptab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`ppanel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => showPanelTab(tab.id)}
                  onKeyDown={(e) =>
                    onTabKeyDown(
                      e,
                      PANEL_TABS.map((p) => p.id),
                      panelTab,
                      showPanelTab,
                      "ptab",
                    )
                  }
                  className={cn(
                    "h-8 rounded-md text-sm font-medium transition-colors",
                    selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* All panels stay mounted (hidden attribute), so an open PDF or a paused video survives tab switches. */}
          <div id="ppanel-materials" role="tabpanel" aria-labelledby="ptab-materials" hidden={panelTab !== "materials"} className="rounded-xl border bg-card/60 p-3 sm:p-4">
            <h2 className="mb-3 text-xl">{t.tabs.materials}</h2>
            <MaterialsPanel lessonId={lesson.id} materials={data.materials} onViewerChange={setViewerOpen} />
          </div>
          <div id="ppanel-info" role="tabpanel" aria-labelledby="ptab-info" hidden={panelTab !== "info"} className="rounded-xl border bg-card/60 p-3 sm:p-4">
            <h2 className="mb-3 text-xl">{t.tabs.info}</h2>
            <LessonInfo lesson={lesson} />
          </div>
          <div id="ppanel-recordings" role="tabpanel" aria-labelledby="ptab-recordings" hidden={panelTab !== "recordings"} className="rounded-xl border bg-card/60 p-3 sm:p-4">
            <h2 className="mb-3 text-xl">{t.tabs.recordings}</h2>
            <RecordingsPanel lessonId={lesson.id} recordings={data.recordings} visible={panelTab === "recordings" && (isDesktop || mobileView !== "classroom")} />
          </div>
        </aside>
      </div>
    </div>
  );
}
