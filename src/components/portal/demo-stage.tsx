import { FlaskConical, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";

const t = portalText.demo;

/**
 * The clearly labelled demo classroom (ZOOM_MODE=demo). It deliberately shows no video, no
 * participants and claims no connection — it only stands in for where the live class will be.
 */
export function DemoStage({ lessonTitle, onLeave }: { lessonTitle: string; onLeave: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-dashed border-rose/50 bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
        <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
        <span>{t.label}</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <MonitorPlay aria-hidden="true" className="size-10 text-rose-deep" strokeWidth={1.25} />
        <div className="grid max-w-lg gap-2">
          <h2 className="text-2xl">{t.title}</h2>
          <p className="text-sm font-medium">{lessonTitle}</p>
          <p className="text-sm text-muted-foreground">{t.body}</p>
          <p className="text-sm text-muted-foreground">{t.hint}</p>
          <p className="text-xs text-muted-foreground">{t.noCamera}</p>
        </div>
        <Button variant="outline" size="lg" onClick={onLeave}>
          {portalText.stage.leave}
        </Button>
      </div>
    </div>
  );
}
