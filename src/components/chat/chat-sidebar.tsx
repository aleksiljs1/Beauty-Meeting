"use client";

import { ArrowLeft, Loader2, MessageSquarePlus, MoreVertical, Pin, PinOff, Search, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { closeChats, openChats, refreshChats, showChat, useChat } from "@/hooks/use-chat";
import { chatText as t } from "@/i18n/chat";
import { ApiClientError, apiGet, apiSend } from "@/lib/api/client";
import type { ChatPerson, ChatSummary } from "@/lib/chat";
import { academyDay, formatDate, formatTime, todayInAcademy } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { ChatThread } from "./chat-thread";

const errorMessage = (error: unknown) => (error instanceof ApiClientError ? error.message : t.loadError);

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cn("flex min-w-4 items-center justify-center rounded-full bg-rose-deep px-1 text-[10px] leading-4 font-semibold text-primary-foreground", className)}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Today: the time. Earlier: the date. */
const listTime = (iso: string) => (academyDay(iso) === todayInAcademy() ? formatTime(iso) : formatDate(iso));

/**
 * The plane button that opens the chat sidebar, with the unread badge. `withLabel` is the
 * full-width version for the admin side navigation.
 */
export function ChatButton({ withLabel = false, className }: { withLabel?: boolean; className?: string }) {
  const { inbox, open } = useChat();
  const unread = inbox?.unreadTotal ?? 0;

  if (withLabel) {
    return (
      <Button variant="ghost" className={cn("w-full justify-start gap-2 px-2", className)} aria-label={t.open(unread)} aria-expanded={open} onClick={() => openChats()}>
        <Send className="size-4" aria-hidden />
        <span className="flex-1 text-left text-sm">{t.title}</span>
        <UnreadBadge count={unread} />
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="icon-lg" className={cn("relative", className)} aria-label={t.open(unread)} aria-expanded={open} onClick={() => openChats()}>
      <Send className="size-5" aria-hidden />
      <UnreadBadge count={unread} className="absolute top-0.5 right-0.5" />
    </Button>
  );
}

/** The chat sidebar: chat list, people search for a new chat, and the open chat. Mount once per layout. */
export function ChatSidebar() {
  const { inbox, error, open, activeChatId } = useChat();
  const [view, setView] = useState<"list" | "people">("list");
  /** Name of a chat just started from the people search (not on the list until its first message). */
  const [startedTitle, setStartedTitle] = useState<{ id: string; title: string } | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; title: string } | null>(null);

  const active = activeChatId ? inbox?.chats.find((c) => c.id === activeChatId) : undefined;
  const activeTitle = active?.title ?? (startedTitle?.id === activeChatId ? startedTitle.title : "");

  async function togglePin(chat: { id: string; pinned: boolean }) {
    try {
      await apiSend("patch", `/chats/${chat.id}`, { pinned: !chat.pinned });
      await refreshChats();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const { id } = toDelete;
    setToDelete(null);
    try {
      await apiSend("patch", `/chats/${id}`, { hidden: true });
      toast.success(t.deleted);
      if (activeChatId === id) showChat(null);
      await refreshChats();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function startWith(person: ChatPerson) {
    try {
      const { id } = await apiSend<{ id: string }>("post", "/chats", { userId: person.id });
      setStartedTitle({ id, title: person.name });
      setView("list");
      showChat(id);
      void refreshChats();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) return;
          closeChats();
          setView("list");
        }}
      >
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{t.title}</SheetTitle>
            <SheetDescription>{t.description}</SheetDescription>
          </SheetHeader>

          {activeChatId ? (
            <ChatThread
              key={activeChatId}
              chatId={activeChatId}
              title={activeTitle}
              pinned={active?.pinned ?? false}
              onBack={() => showChat(null)}
              onTogglePin={() => void togglePin({ id: activeChatId, pinned: active?.pinned ?? false })}
              onDelete={() => setToDelete({ id: activeChatId, title: activeTitle })}
            />
          ) : view === "people" ? (
            <PeoplePicker onBack={() => setView("list")} onPick={(person) => void startWith(person)} />
          ) : (
            <ChatList
              chats={inbox?.chats ?? null}
              error={error}
              onNew={() => setView("people")}
              onOpen={(id) => showChat(id)}
              onTogglePin={(chat) => void togglePin(chat)}
              onDelete={(chat) => setToDelete({ id: chat.id, title: chat.title })}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!toDelete} onOpenChange={(next) => !next && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              {t.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChatList({
  chats,
  error,
  onNew,
  onOpen,
  onTogglePin,
  onDelete,
}: {
  chats: ChatSummary[] | null;
  error: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onTogglePin: (chat: ChatSummary) => void;
  onDelete: (chat: ChatSummary) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-3 pr-12">
        <h2 className="flex-1 font-heading text-xl">{t.title}</h2>
        <Button variant="outline" size="sm" onClick={onNew}>
          <MessageSquarePlus aria-hidden /> {t.newChat}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {chats === null ? (
          error ? (
            <div className="grid justify-items-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <p>{t.loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void refreshChats()}>
                {t.retry}
              </Button>
            </div>
          ) : (
            <div className="flex justify-center p-6 text-muted-foreground">
              <Loader2 className="animate-spin" aria-hidden />
            </div>
          )
        ) : chats.length === 0 ? (
          <div className="grid gap-1 p-6 text-center text-sm">
            <p>{t.empty}</p>
            <p className="text-muted-foreground">{t.emptyHint}</p>
          </div>
        ) : (
          <ul className="divide-y">
            {chats.map((chat) => (
              <li key={chat.id} className="flex items-center gap-1 pr-2 transition-colors hover:bg-muted/60">
                <button
                  type="button"
                  onClick={() => onOpen(chat.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Avatar name={chat.title} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-sm", chat.unread > 0 ? "font-semibold" : "font-medium")}>{chat.title}</span>
                      {chat.lastMessage ? <span className="shrink-0 text-[11px] text-muted-foreground">{listTime(chat.lastMessage.createdAt)}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-xs", chat.unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                        {chat.lastMessage
                          ? `${chat.lastMessage.mine ? `${t.you}: ` : ""}${chat.lastMessage.body ?? t.deletedMessage}`
                          : t.noMessagesYet}
                      </span>
                      {chat.pinned ? <Pin className="size-3.5 shrink-0 text-rose-deep" aria-label={t.pinned} /> : null}
                      {chat.unread > 0 ? (
                        <>
                          <UnreadBadge count={chat.unread} />
                          <span className="sr-only">{t.unread(chat.unread)}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`${t.actions}: ${chat.title}`}>
                      <MoreVertical aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onTogglePin(chat)}>
                      {chat.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />} {chat.pinned ? t.unpin : t.pin}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onDelete(chat)} className="text-destructive focus:text-destructive">
                      <Trash2 aria-hidden /> {t.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PeoplePicker({ onBack, onPick }: { onBack: () => void; onPick: (person: ChatPerson) => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<ChatPerson[] | null>(null);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      apiGet<ChatPerson[]>("/chats/people", query.trim() ? { q: query.trim() } : undefined)
        .then((result) => !cancelled && setPeople(result))
        .catch((error) => !cancelled && toast.error(errorMessage(error)));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b px-2 py-2 pr-12">
        <Button variant="ghost" size="icon-lg" aria-label={t.back} onClick={onBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h2 className="flex-1 font-heading text-lg">{t.newChat}</h2>
      </header>
      <div className="relative border-b p-3">
        <Search className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchLabel} className="pl-9" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {people === null ? (
          <div className="flex justify-center p-6 text-muted-foreground">
            <Loader2 className="animate-spin" aria-hidden />
          </div>
        ) : people.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t.noPeople}</p>
        ) : (
          <ul className="divide-y">
            {people.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => onPick(person)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Avatar name={person.name} />
                  <span className="grid min-w-0">
                    <span className="truncate text-sm font-medium">{person.name}</span>
                    <span className="text-xs text-muted-foreground">{t.roles[person.role] ?? person.role}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
