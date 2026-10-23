"use client";

import { BellOff, CheckCheck, Clock3, PlayCircle, Radio } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshLiveFeed, useLiveFeed, type FeedNotification, type LiveFeed } from "@/hooks/use-live-feed";
import { portalText } from "@/i18n/portal";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { formatDateTime, timezoneAbbreviation } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

const t = portalText.notifications;

const ICONS = { LESSON_LIVE: Radio, LESSON_STARTING_SOON: Clock3, RECORDING_READY: PlayCircle } as const;

function lessonHref(n: FeedNotification) {
  if (!n.lessonId || !n.lessonTitle) return null;
  return n.type === "RECORDING_READY" ? `/portal/mesimet/${n.lessonId}?panel=regjistrimet` : `/portal/mesimet/${n.lessonId}`;
}

/** Server-rendered first page of the feed, then kept fresh by the shared poller. */
export function NotificationsList({ initial }: { initial: LiveFeed }) {
  const { feed } = useLiveFeed();
  const data = feed ?? initial;
  const [locallyRead, setLocallyRead] = useState<ReadonlySet<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);

  const isUnread = (n: FeedNotification) => !n.readAt && !locallyRead.has(n.id);
  const unread = data.notifications.filter(isUnread);

  const markRead = async (ids: string[] | "all") => {
    const targets = ids === "all" ? unread.map((n) => n.id) : ids;
    setLocallyRead((prev) => new Set([...prev, ...targets]));
    try {
      await apiSend("post", "/notifications/read", { ids });
      refreshLiveFeed({ broadcast: true });
    } catch (error) {
      setLocallyRead((prev) => new Set([...prev].filter((id) => !targets.includes(id))));
      toast.error(error instanceof ApiClientError ? error.message : portalText.states.errorBody);
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    await markRead("all");
    setMarkingAll(false);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl sm:text-4xl">{t.title}</h1>
        <Button variant="outline" size="lg" onClick={() => void markAll()} disabled={markingAll || unread.length === 0}>
          <CheckCheck aria-hidden="true" />
          {markingAll ? t.marking : t.markAllRead}
        </Button>
      </div>

      {data.notifications.length === 0 ? (
        <EmptyState icon={BellOff} title={t.empty} />
      ) : (
        <ul className="grid gap-2">
          {data.notifications.map((n) => {
            const Icon = ICONS[n.type];
            const href = lessonHref(n);
            const unreadItem = isUnread(n);
            return (
              <li
                key={n.id}
                className={cn("flex items-start gap-3 rounded-lg border p-4 transition-colors duration-200 hover:border-rose/30", unreadItem ? "bg-card" : "bg-card/50")}
              >
                <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", n.type === "LESSON_LIVE" ? "text-live" : "text-rose-deep")} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", unreadItem && "font-semibold")}>
                    {t.types[n.type]}
                    {unreadItem ? <span className="sr-only"> — {t.unread}</span> : null}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{n.lessonTitle ?? t.unavailableLesson}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <time dateTime={n.createdAt}>
                      {formatDateTime(n.createdAt)} ({timezoneAbbreviation(n.createdAt)})
                    </time>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {href ? (
                      <Button asChild size="sm" variant="secondary">
                        <Link href={href} onClick={() => unreadItem && void markRead([n.id])}>
                          {t.open}
                        </Link>
                      </Button>
                    ) : null}
                    {unreadItem ? (
                      <Button size="sm" variant="ghost" onClick={() => void markRead([n.id])}>
                        {t.markRead}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {unreadItem ? <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-rose-deep" /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
