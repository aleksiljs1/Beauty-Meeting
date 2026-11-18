"use client";

import { SquarePen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  askDeleteChat,
  closeWindow,
  dockLayout,
  minimizeWindow,
  NEW_CHAT_WINDOW,
  openNewChatWindow,
  openWindow,
  replaceNewChatWindow,
  touchWindow,
  type ChatState,
  type ChatWindow,
} from "@/hooks/use-chat";
import { chatText as t } from "@/i18n/chat";
import { Avatar, chatMeta, PeoplePicker, startChatWith, togglePin, UnreadBadge } from "./chat-common";
import { ChatThread } from "./chat-thread";

const { WINDOW_WIDTH, WINDOW_GAP, BUBBLE_COLUMN } = dockLayout;

/**
 * Computers only (hidden below md): Facebook-style chat windows docked at the bottom right,
 * newest furthest right, and a column of round bubbles for minimized chats with the "new message"
 * button under them. The column only shows while any chat window or bubble is around, so it never
 * sits over a page for nothing.
 */
export function ChatDock({ state }: { state: ChatState }) {
  // A window whose chat isn't known (deleted, or a reload before the list loaded) waits or goes.
  const windows = state.windows.filter((w) => w.id === NEW_CHAT_WINDOW || chatMeta(state, w.id));
  const open = windows.filter((w) => !w.minimized);
  const bubbles = windows.filter((w) => w.minimized);
  if (!windows.length) return null;

  return (
    <div className="hidden md:block print:hidden">
      {open.map((w, index) => (
        <div
          key={w.id}
          className="fixed bottom-0 z-40 flex h-[min(455px,calc(100dvh-5rem))] flex-col overflow-hidden rounded-t-xl border border-b-0 bg-background shadow-2xl"
          style={{ width: WINDOW_WIDTH, right: BUBBLE_COLUMN + index * (WINDOW_WIDTH + WINDOW_GAP) }}
          role="dialog"
          aria-label={w.id === NEW_CHAT_WINDOW ? t.newMessage : (chatMeta(state, w.id)?.title ?? t.title)}
          onPointerDown={() => touchWindow(w.id)}
          onFocus={() => touchWindow(w.id)}
        >
          {w.id === NEW_CHAT_WINDOW ? <NewChatWindow /> : <ChatWindowBody state={state} window={w} />}
        </div>
      ))}

      <div className="fixed right-4 bottom-4 z-40 flex flex-col-reverse items-center gap-3" style={{ width: BUBBLE_COLUMN - 32 }}>
        <Button
          size="icon-lg"
          variant="outline"
          className="size-12 rounded-full bg-background shadow-lg"
          aria-label={t.newMessage}
          title={t.newMessage}
          onClick={openNewChatWindow}
        >
          <SquarePen className="size-5" aria-hidden />
        </Button>
        {bubbles.map((w) => {
          const meta = chatMeta(state, w.id)!;
          return (
            <div key={w.id} className="group relative">
              <button
                type="button"
                onClick={() => openWindow(w.id)}
                title={meta.title}
                aria-label={meta.unread > 0 ? `${meta.title}, ${t.unread(meta.unread)}` : meta.title}
                className="block rounded-full shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Avatar name={meta.title} className="size-12 border-2 border-background text-sm" />
              </button>
              <UnreadBadge count={meta.unread} className="pointer-events-none absolute -top-0.5 -left-0.5 min-w-5 text-[11px] leading-5" />
              <button
                type="button"
                onClick={() => closeWindow(w.id)}
                aria-label={`${t.close}: ${meta.title}`}
                className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatWindowBody({ state, window: w }: { state: ChatState; window: ChatWindow }) {
  const meta = chatMeta(state, w.id)!;
  return (
    <ChatThread
      key={w.id}
      chatId={w.id}
      title={meta.title}
      otherUserId={meta.otherUserId}
      canBlock={meta.canBlock}
      pinned={meta.pinned}
      markRead={!w.quiet}
      autoFocus={!w.quiet}
      dock={{ onMinimize: () => minimizeWindow(w.id), onClose: () => closeWindow(w.id), highlight: meta.unread > 0 }}
      onTogglePin={() => void togglePin(w.id, meta.pinned)}
      onDelete={() => askDeleteChat({ id: w.id, title: meta.title })}
    />
  );
}

/** "New message": pick a person, then this window turns into the chat with them. */
function NewChatWindow() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b py-2 pr-1 pl-3">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{t.newMessage}</h3>
        <Button variant="ghost" size="icon-sm" aria-label={t.close} title={t.close} onClick={() => closeWindow(NEW_CHAT_WINDOW)}>
          <X className="size-4" />
        </Button>
      </header>
      <PeoplePicker
        onPick={(person) =>
          void startChatWith(person).then((id) => {
            if (id) replaceNewChatWindow(id);
          })
        }
      />
    </div>
  );
}
