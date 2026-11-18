"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { askDeleteChat, closeChats, openChats, openWindow, showChat, useChat, useIsDesktop } from "@/hooks/use-chat";
import { chatText as t } from "@/i18n/chat";
import { cn } from "@/lib/utils";
import { ChatDock } from "./chat-dock";
import { ChatInboxPanel, chatMeta, deleteChat, togglePin, UnreadBadge } from "./chat-common";
import { ChatThread } from "./chat-thread";

/** True while this element is actually on screen (not inside a part of the layout hidden at this width). */
function useShown<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const check = () => setShown(!!ref.current && ref.current.getClientRects().length > 0);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return [ref, shown] as const;
}

/**
 * The plane button with the unread badge. On computers it drops down the chat list (like
 * Facebook's Messenger menu) and a chat opens in a docked window; on phones it opens the chats
 * full screen. `withLabel` is the full-width version for the admin side navigation (its list
 * opens to the right).
 */
export function ChatButton({ withLabel = false, className }: { withLabel?: boolean; className?: string }) {
  const state = useChat();
  const desktop = useIsDesktop();
  const [ref, shown] = useShown<HTMLButtonElement>();
  const unread = state.inbox?.unreadTotal ?? 0;
  // The admin layout has two of these (side navigation, phone header): only the visible one drops down.
  const listOpen = state.open && desktop && shown;
  /** A chat was just opened from the list: keep the cursor in its window instead of returning it to this button. */
  const openedChat = useRef(false);

  return (
    <Popover open={listOpen} onOpenChange={(next) => (next ? openChats() : closeChats())}>
      <PopoverTrigger asChild>
        {withLabel ? (
          <Button ref={ref} variant="ghost" className={cn("w-full justify-start gap-2 px-2", className)} aria-label={t.open(unread)}>
            <Send className="size-4" aria-hidden />
            <span className="flex-1 text-left text-sm">{t.title}</span>
            <UnreadBadge count={unread} />
          </Button>
        ) : (
          <Button ref={ref} variant="ghost" size="icon-lg" className={cn("relative", className)} aria-label={t.open(unread)}>
            <Send className="size-5" aria-hidden />
            <UnreadBadge count={unread} className="absolute top-0.5 right-0.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        side={withLabel ? "right" : "bottom"}
        align="end"
        sideOffset={8}
        className="flex h-[min(34rem,calc(100dvh-6rem))] w-[22.5rem] flex-col overflow-hidden rounded-xl p-0 shadow-xl"
        aria-label={t.title}
        onCloseAutoFocus={(event) => {
          if (openedChat.current) event.preventDefault();
          openedChat.current = false;
        }}
      >
        <ChatInboxPanel
          state={state}
          onOpen={(id) => {
            openedChat.current = true;
            closeChats();
            openWindow(id);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Mount once per layout: the full-screen chats on phones, the docked windows on computers, and
 * the "delete chat?" confirmation for both.
 */
export function ChatSidebar() {
  const state = useChat();
  const desktop = useIsDesktop();
  const { open, activeChatId, toDelete } = state;
  const active = activeChatId ? chatMeta(state, activeChatId) : null;

  // The "you have new messages" email links to ?mesazhet=1: open the chats, then tidy the address.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("mesazhet")) return;
    url.searchParams.delete("mesazhet");
    window.history.replaceState(window.history.state, "", url);
    openChats();
  }, []);

  return (
    <>
      <Sheet open={open && !desktop} onOpenChange={(next) => !next && closeChats()}>
        {/* Full screen on phones. The sheet's own side rules (3/4 width, max-w-sm) are more specific, so override those. */}
        <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{t.title}</SheetTitle>
            <SheetDescription>{t.description}</SheetDescription>
          </SheetHeader>

          {activeChatId && active ? (
            <ChatThread
              key={activeChatId}
              chatId={activeChatId}
              title={active.title}
              otherUserId={active.otherUserId}
              canBlock={active.canBlock}
              pinned={active.pinned}
              onBack={() => showChat(null)}
              onTogglePin={() => void togglePin(activeChatId, active.pinned)}
              onDelete={() => askDeleteChat({ id: activeChatId, title: active.title })}
            />
          ) : (
            <ChatInboxPanel state={state} inSheet onOpen={(id) => showChat(id)} />
          )}
        </SheetContent>
      </Sheet>

      <ChatDock state={state} />

      <AlertDialog open={!!toDelete} onOpenChange={(next) => !next && askDeleteChat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!toDelete) return;
                askDeleteChat(null);
                void deleteChat(toDelete.id);
              }}
            >
              {t.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
