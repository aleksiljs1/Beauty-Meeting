
"use client";

import { useRouter } from "next/navigation";
import {
  Archive,
  Ban,
  Eye,
  EyeOff,
  FlaskConical,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
  Video,
} from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { DemoBadge, MeetingBadge, PublicationBadge } from "@/components/admin/page-parts";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/api/client";
import { formatDateTime } from "@/lib/datetime";
import { admin } from "@/i18n/admin";

const t = admin.lessonActions;
type Publication = "DRAFT" | "PUBLISHED" | "ARCHIVED" | "CANCELLED";

export function LessonStatusPanel({
  lesson,
  zoomMode,
  zoomApiConfigured,
}: {
  lesson: {
    id: string;
    publication: Publication;
    meetingStatus: "NOT_PROVISIONED" | "SCHEDULED" | "LIVE" | "ENDED" | "ERROR";
    isDemo: boolean;
    liveStartedAt: Date | null;
    liveEndedAt: Date | null;
    enrollmentCount: number;
    zoomMeetingNumber: string | null;
    zoomMeetingUuid: string | null;
  };
  zoomMode: "demo" | "live";
  zoomApiConfigured: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useApiAction();

  const setPublication = (publication: Publication) =>
    run(
      () => apiSend("post", `/admin/lessons/${lesson.id}/publication`, { publication }),
      { success: t.done[publication] },
    );

  const demo = (action: "live" | "end" | "reset", success: string) =>
    run(
      () => apiSend("post", `/admin/lessons/${lesson.id}/demo`, { action }),
      { success },
    );

  // Creates a real Zoom meeting through the protected admin API.
  const createZoomMeeting = () =>
    run(
      () => apiSend("post", `/admin/lessons/${lesson.id}/zoom-meeting`),
      { success: "Takimi Zoom u krijua dhe u ruajt me sukses." },
    );

  const isLive = lesson.meetingStatus === "LIVE";
  const p = lesson.publication;

  return (
    <div className="space-y-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-muted-foreground">{t.publication}</dt>
          <dd>
            <PublicationBadge publication={p} />
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="text-muted-foreground">{t.meeting}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <MeetingBadge status={lesson.meetingStatus} />
            {lesson.isDemo && <DemoBadge />}
          </dd>
        </div>
      </dl>

      {lesson.liveStartedAt && (
        <p className="text-sm text-muted-foreground">
          {t.liveSince} {formatDateTime(lesson.liveStartedAt)}
          {lesson.liveEndedAt
            ? ` · ${t.endedAt} ${formatDateTime(lesson.liveEndedAt)}`
            : ""}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {p === "DRAFT" && (
          <ConfirmAction
            trigger={
              <Button disabled={pending}>
                <Eye aria-hidden /> {t.publish}
              </Button>
            }
            title={t.publishTitle}
            description={t.publishBody}
            confirmLabel={t.publish}
            onConfirm={() => setPublication("PUBLISHED")}
          />
        )}

        {p === "PUBLISHED" && (
          <ConfirmAction
            trigger={
              <Button variant="outline" disabled={pending || isLive}>
                <EyeOff aria-hidden /> {t.unpublish}
              </Button>
            }
            title={t.unpublishTitle}
            description={t.unpublishBody}
            confirmLabel={t.unpublish}
            onConfirm={() => setPublication("DRAFT")}
          />
        )}

        {(p === "CANCELLED" || p === "ARCHIVED") && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setPublication("DRAFT")}
          >
            <Undo2 aria-hidden /> {t.restoreDraft}
          </Button>
        )}

        {(p === "DRAFT" || p === "PUBLISHED") && (
          <ConfirmAction
            trigger={
              <Button variant="destructive" disabled={pending || isLive}>
                <Ban aria-hidden /> {t.cancel}
              </Button>
            }
            title={t.cancelTitle}
            description={t.cancelBody}
            confirmLabel={t.cancel}
            destructive
            onConfirm={() => setPublication("CANCELLED")}
          />
        )}

        {p !== "ARCHIVED" && (
          <ConfirmAction
            trigger={
              <Button variant="outline" disabled={pending || isLive}>
                <Archive aria-hidden /> {t.archive}
              </Button>
            }
            title={t.archiveTitle}
            description={t.archiveBody}
            confirmLabel={t.archive}
            onConfirm={() => setPublication("ARCHIVED")}
          />
        )}

        {p === "DRAFT" && lesson.enrollmentCount === 0 && (
          <ConfirmAction
            trigger={
              <Button variant="destructive" disabled={pending}>
                <Trash2 aria-hidden /> {t.deleteDraft}
              </Button>
            }
            title={t.deleteTitle}
            description={t.deleteBody}
            confirmLabel={t.deleteDraft}
            destructive
            onConfirm={async () => {
              const done = await run(
                () => apiSend("delete", `/admin/lessons/${lesson.id}`),
                { success: t.deleted, refresh: false },
              );

              if (done) router.push("/admin/mesimet");
            }}
          />
        )}

        {/* Krijimi i takimit real në Zoom */}
        {zoomApiConfigured &&
          !lesson.isDemo &&
          !lesson.zoomMeetingNumber &&
          !lesson.zoomMeetingUuid &&
          lesson.meetingStatus !== "LIVE" &&
          lesson.meetingStatus !== "ENDED" &&
          p !== "CANCELLED" &&
          p !== "ARCHIVED" && (
            <ConfirmAction
              trigger={
                <Button variant="outline" disabled={pending}>
                  <Video aria-hidden />
                  Krijo takim Zoom (test)
                </Button>
              }
              title="Të krijohet një takim real në Zoom?"
              description="Kjo do të krijojë një takim në llogarinë Zoom të akademisë dhe do ta lidhë me këtë mësim. Takimi nuk do të nisë automatikisht dhe hyrja e studentëve nuk do të aktivizohet ende."
              confirmLabel="Krijo takimin"
              onConfirm={createZoomMeeting}
            />
          )}

        {lesson.zoomMeetingNumber && (
          <p className="w-full text-sm text-muted-foreground">
            Numri i takimit Zoom: {lesson.zoomMeetingNumber}
          </p>
        )}
      </div>

      {zoomMode === "demo" && (
        <p className="text-sm text-muted-foreground">{t.zoomStatus}</p>
      )}

      {lesson.isDemo && (
        <div
          className="space-y-3 rounded-md border border-dashed border-rose p-4"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <FlaskConical className="size-4 text-rose-deep" aria-hidden />
            <h3 className="font-sans text-sm font-medium">{t.demoTitle}</h3>
          </div>

          <p className="text-xs text-muted-foreground">{t.demoHint}</p>

          {p !== "PUBLISHED" ? (
            <p className="text-sm text-muted-foreground">
              {t.demoNeedsPublish}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(lesson.meetingStatus === "SCHEDULED" ||
                lesson.meetingStatus === "NOT_PROVISIONED") && (
                <Button
                  className="bg-live text-white hover:bg-live/90"
                  disabled={pending}
                  onClick={() => demo("live", t.demoStarted)}
                >
                  <span className="size-2 rounded-full bg-white" aria-hidden />
                  {t.demoStart}
                </Button>
              )}

              {isLive && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => demo("end", t.demoEnded)}
                >
                  <Square aria-hidden /> {t.demoEnd}
                </Button>
              )}

              {lesson.meetingStatus === "ENDED" && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => demo("reset", t.demoResetDone)}
                >
                  <RotateCcw aria-hidden /> {t.demoReset}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
