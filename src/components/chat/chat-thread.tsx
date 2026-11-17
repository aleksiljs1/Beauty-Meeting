"use client";

import { ArrowLeft, Ban, Loader2, MoreVertical, Pin, PinOff, Send, Trash2, Unlock } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { refreshChats } from "@/hooks/use-chat";
import { chatText as t } from "@/i18n/chat";
import { ApiClientError, apiGet, apiSend } from "@/lib/api/client";
import { MAX_MESSAGE_LENGTH, type ChatMessageItem, type ChatPage } from "@/lib/chat";
import { academyDay, formatDate, formatTime } from "@/lib/datetime";
import { subscribeChat } from "@/lib/realtime/client";
import { cn } from "@/lib/utils";

const errorMessage = (error: unknown) => (error instanceof ApiClientError ? error.message : t.loadError);
/** Within this distance of the bottom, new messages scroll into view by themselves. */
const STICK_TO_BOTTOM_PX = 120;

/** Merge by id (newer copies win, e.g. a message deleted for everyone), ordered oldest first. */
function merge(current: ChatMessageItem[], incoming: ChatMessageItem[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * One open chat: messages, "Parë", load older, composer, and pin/delete/block in the header menu.
 * When either person has blocked the other, the composer is replaced by a notice. The block state
 * comes with every load of the messages, so a block or unblock made mid-chat (by either side)
 * shows as soon as the chat refetches on its realtime signal.
 */
export function ChatThread({
  chatId,
  title,
  otherUserId,
  pinned,
  onBack,
  onTogglePin,
  onDelete,
}: {
  chatId: string;
  title: string;
  /** The other person in this direct chat (null once their account is deleted: nothing to block). */
  otherUserId: string | null;
  pinned: boolean;
  onBack: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [readBy, setReadBy] = useState<ChatPage["readBy"]>([]);
  const [blocked, setBlocked] = useState<ChatPage["blocked"]>({ byMe: false, byThem: false });
  const [blocking, setBlocking] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  /** How the next render should scroll: to the bottom, keep position after loading older, or leave it. */
  const scrollMode = useRef<"bottom" | "keep" | "auto">("bottom");
  const heightBeforeOlder = useRef(0);
  const lastMarked = useRef<string | null>(null);

  /** Newest page in: the first one replaces everything, later ones merge into what's loaded. */
  const applyPage = useCallback((page: ChatPage, first: boolean) => {
    setMessages((current) => merge(first ? [] : current, page.messages));
    setReadBy(page.readBy);
    setBlocked(page.blocked);
    if (first) setHasMore(page.hasMore);
    setStatus("ready");
  }, []);

  const loadLatest = useCallback(
    (first = false) =>
      apiGet<ChatPage>(`/chats/${chatId}/messages`)
        .then((page) => applyPage(page, first))
        .catch((error) => (first ? setStatus("error") : toast.error(errorMessage(error)))),
    [chatId, applyPage],
  );

  // First page, then live updates: a "chat changed" signal refetches the newest page.
  useEffect(() => {
    let cancelled = false;
    scrollMode.current = "bottom";
    lastMarked.current = null;
    apiGet<ChatPage>(`/chats/${chatId}/messages`)
      .then((page) => !cancelled && applyPage(page, true))
      .catch(() => !cancelled && setStatus("error"));
    const unsubscribe = subscribeChat(() => {
      // Follow new messages only if the reader is already at the bottom (not reading history).
      const el = scroller.current;
      const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
      scrollMode.current = nearBottom ? "bottom" : "auto";
      void loadLatest();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [chatId, applyPage, loadLatest]);

  // Read receipts: once the newest message from someone else is on screen, mark the chat read.
  const markIfNeeded = useCallback(() => {
    const last = messages.at(-1);
    if (!last || last.mine || last.id === lastMarked.current || document.visibilityState !== "visible") return;
    lastMarked.current = last.id;
    void apiSend("post", `/chats/${chatId}/read`)
      .then(() => refreshChats())
      .catch(() => {
        lastMarked.current = null; // try again on the next update
      });
  }, [chatId, messages]);

  useEffect(() => {
    markIfNeeded();
    document.addEventListener("visibilitychange", markIfNeeded);
    return () => document.removeEventListener("visibilitychange", markIfNeeded);
  }, [markIfNeeded]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const mode = scrollMode.current;
    if (mode === "keep") el.scrollTop = el.scrollHeight - heightBeforeOlder.current;
    else if (mode === "bottom") el.scrollTop = el.scrollHeight;
    scrollMode.current = "auto";
  }, [messages]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await apiGet<ChatPage>(`/chats/${chatId}/messages`, { before: oldest.id });
      heightBeforeOlder.current = scroller.current?.scrollHeight ?? 0;
      scrollMode.current = "keep";
      setMessages((current) => merge(current, page.messages));
      setHasMore(page.hasMore);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await apiSend("post", `/chats/${chatId}/messages`, { body });
      setDraft("");
      scrollMode.current = "bottom";
      await loadLatest();
      void refreshChats();
    } catch (error) {
      toast.error(errorMessage(error));
      // Blocked a moment ago (before this screen caught up): reload so the notice replaces the composer.
      if (error instanceof ApiClientError && error.code === "FORBIDDEN") void loadLatest();
    } finally {
      setSending(false);
    }
  }

  /** Block or unblock the other person. Both screens update through the realtime signal. */
  async function toggleBlock() {
    if (!otherUserId || blocking) return;
    const unblocking = blocked.byMe;
    setBlocking(true);
    try {
      await apiSend(unblocking ? "delete" : "post", `/chats/blocks/${otherUserId}`);
      toast.success(unblocking ? t.unblockedToast(title) : t.blockedToast(title));
      await loadLatest();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBlocking(false);
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter starts a new line (as in WhatsApp Web).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  // "Parë" goes under my newest message once someone else has read up to it.
  const lastMine = [...messages].reverse().find((m) => m.mine);
  const seen = !!lastMine && readBy.some((r) => r.lastReadAt && Date.parse(r.lastReadAt) >= Date.parse(lastMine.createdAt));
  const left = MAX_MESSAGE_LENGTH - draft.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b px-2 py-2 pr-12">
        <Button variant="ghost" size="icon-lg" aria-label={t.back} onClick={onBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h3 className="min-w-0 flex-1 truncate font-heading text-lg">{title}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" aria-label={t.actions}>
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onTogglePin}>
              {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />} {pinned ? t.unpin : t.pin}
            </DropdownMenuItem>
            {otherUserId ? (
              <DropdownMenuItem onSelect={() => void toggleBlock()} disabled={blocking}>
                {blocked.byMe ? <Unlock aria-hidden /> : <Ban aria-hidden />} {blocked.byMe ? t.unblock : t.block}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 aria-hidden /> {t.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        {status === "loading" ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="animate-spin" aria-hidden />
          </div>
        ) : status === "error" ? (
          <div className="grid h-full place-content-center justify-items-center gap-2 text-center text-sm text-muted-foreground">
            <p>{t.loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void loadLatest(true)}>
              {t.retry}
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <p className="grid h-full place-content-center text-sm text-muted-foreground">{t.noMessagesYet}</p>
        ) : (
          <ol className="grid gap-1.5">
            {hasMore ? (
              <li className="mb-2 flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => void loadOlder()} disabled={loadingOlder}>
                  {loadingOlder ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {t.loadOlder}
                </Button>
              </li>
            ) : null}
            {messages.map((message, index) => {
              const day = academyDay(message.createdAt);
              const newDay = index === 0 || academyDay(messages[index - 1].createdAt) !== day;
              return (
                <li key={message.id} className="grid gap-1.5">
                  {newDay ? <p className="my-2 text-center text-xs text-muted-foreground">{formatDate(message.createdAt)}</p> : null}
                  <div className={cn("flex", message.mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-xs",
                        message.mine ? "rounded-br-sm bg-rose-deep text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground",
                      )}
                    >
                      {message.body === null ? (
                        <p className="italic opacity-80">{t.deletedMessage}</p>
                      ) : (
                        <p className="wrap-break-word whitespace-pre-wrap">{message.body}</p>
                      )}
                      <p className={cn("mt-0.5 text-right text-[11px]", message.mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
                        {formatTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                  {message === lastMine && seen ? <p className="text-right text-[11px] text-muted-foreground">{t.seen}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {blocked.byMe || blocked.byThem ? (
        // Blocked either way: no composer. Only the one who blocked is told, and offered to unblock.
        <div className="grid justify-items-center gap-2 border-t bg-muted/40 p-4 text-center text-sm" role="status">
          <p className="flex items-center gap-2 text-muted-foreground">
            <Ban className="size-4" aria-hidden /> {t.cantSend}
          </p>
          {blocked.byMe ? (
            <>
              <p className="text-xs text-muted-foreground">{t.youBlocked}</p>
              <Button variant="outline" size="sm" onClick={() => void toggleBlock()} disabled={blocking}>
                {blocking ? <Loader2 className="animate-spin" aria-hidden /> : <Unlock aria-hidden />} {t.unblock}
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <form
          className="flex items-end gap-2 border-t p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="grid min-w-0 flex-1 gap-1">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKey}
              placeholder={t.composerPlaceholder}
              aria-label={t.composerLabel}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={1}
              className="max-h-32 min-h-10 resize-none"
            />
            {left <= 200 ? <p className="text-right text-[11px] text-muted-foreground">{t.charsLeft(left)}</p> : null}
          </div>
          <Button type="submit" size="icon-lg" aria-label={t.send} disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          </Button>
        </form>
      )}
    </div>
  );
}
