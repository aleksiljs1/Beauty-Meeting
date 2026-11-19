"use client";

import { ArrowLeft, Loader2, MoreHorizontal, Pin, PinOff, Search, SquarePen, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { askDeleteChat, closeWindow, refreshChats, rememberChat, showChat, type ChatState } from "@/hooks/use-chat";
import { chatText as t } from "@/i18n/chat";
import { ApiClientError, apiGet, apiSend } from "@/lib/api/client";
import type { ChatPerson, ChatSummary } from "@/lib/chat";
import { academyDay, formatDate, formatTime, todayInAcademy } from "@/lib/datetime";
import { cn } from "@/lib/utils";

/** Pieces shared by the drop-down/full-screen chat list (chat-sidebar.tsx) and the docked windows (chat-dock.tsx). */

export const errorMessage = (error: unknown) => (error instanceof ApiClientError ? error.message : t.loadError);

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

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold", className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function UnreadBadge({ count, className }: { count: number; className?: string }) {
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

/** What the windows and the full-screen chat need to know about a chat, from the list or a chat just started. */
export function chatMeta(state: ChatState, chatId: string) {
  const chat = state.inbox?.chats.find((c) => c.id === chatId);
  const known = state.known[chatId];
  if (!chat && !known) return null;
  const otherRole = chat ? (chat.otherUser?.role ?? null) : known!.role;
  return {
    title: chat?.title ?? known!.title,
    otherUserId: chat ? (chat.otherUser?.id ?? null) : known!.personId,
    canBlock: otherRole !== "admin",
    pinned: chat?.pinned ?? false,
    unread: chat?.unread ?? 0,
  };
}

export async function togglePin(chatId: string, pinned: boolean) {
  try {
    await apiSend("patch", `/chats/${chatId}`, { pinned: !pinned });
    await refreshChats();
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

/** Hides the chat for me (after the "delete?" confirmation) and closes it wherever it is open. */
export async function deleteChat(chatId: string) {
  try {
    await apiSend("patch", `/chats/${chatId}`, { hidden: true });
    toast.success(t.deleted);
    closeWindow(chatId);
    showChat(null);
    await refreshChats();
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

/** Starts (or reopens) the direct chat with a person and returns its id. */
export async function startChatWith(person: ChatPerson): Promise<string | null> {
  try {
    const { id } = await apiSend<{ id: string }>("post", "/chats", { userId: person.id });
    rememberChat(id, { title: person.name, personId: person.id, role: person.role });
    void refreshChats();
    return id;
  } catch (error) {
    toast.error(errorMessage(error));
    return null;
  }
}

/**
 * The chat list with "new chat" (people search), used in the drop-down on computers and full
 * screen on phones. `inSheet` leaves room for the sheet's own close button.
 */
export function ChatInboxPanel({ state, inSheet = false, onOpen }: { state: ChatState; inSheet?: boolean; onOpen: (chatId: string) => void }) {
  const [view, setView] = useState<"list" | "people">("list");

  if (view === "people") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className={cn("flex items-center gap-1 border-b px-2 py-2", inSheet && "pr-12")}>
          <Button variant="ghost" size="icon-lg" aria-label={t.back} onClick={() => setView("list")}>
            <ArrowLeft className="size-5" />
          </Button>
          <h2 className="flex-1 font-heading text-lg">{t.newChat}</h2>
        </header>
        <PeoplePicker
          onPick={(person) =>
            void startChatWith(person).then((id) => {
              if (!id) return;
              setView("list");
              onOpen(id);
            })
          }
        />
      </div>
    );
  }
  return <ChatList chats={state.inbox?.chats ?? null} error={state.error} inSheet={inSheet} onNew={() => setView("people")} onOpen={onOpen} />;
}

function ChatList({
  chats,
  error,
  inSheet,
  onNew,
  onOpen,
}: {
  chats: ChatSummary[] | null;
  error: boolean;
  inSheet: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className={cn("flex items-center gap-2 border-b px-4 py-3", inSheet && "pr-12")}>
        <h2 className="flex-1 font-heading text-xl">{t.title}</h2>
        <Button variant="ghost" size="icon" className="rounded-full bg-muted" aria-label={t.newChat} title={t.newChat} onClick={onNew}>
          <SquarePen aria-hidden />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
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
          <ul className="grid gap-0.5">
            {chats.map((chat) => (
              <li key={chat.id} className="group relative flex items-center rounded-lg transition-colors hover:bg-muted/70">
                <button
                  type="button"
                  onClick={() => onOpen(chat.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2 pr-10 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Avatar name={chat.title} className="size-12 text-sm" />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className={cn("truncate text-sm", chat.unread > 0 ? "font-semibold" : "font-medium")}>{chat.title}</span>
                    <span className={cn("flex min-w-0 items-center gap-1 text-xs", chat.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      <span className="min-w-0 truncate">
                        {chat.lastMessage
                          ? `${chat.lastMessage.mine ? `${t.you}: ` : ""}${chat.lastMessage.body === null ? t.deletedMessage : t.preview(chat.lastMessage.body, chat.lastMessage.photos, chat.lastMessage.files)}`
                          : t.noMessagesYet}
                      </span>
                      {chat.lastMessage ? <span className="shrink-0">· {listTime(chat.lastMessage.createdAt)}</span> : null}
                    </span>
                  </span>
                  {chat.pinned ? <Pin className="size-3.5 shrink-0 text-rose-deep" aria-label={t.pinned} /> : null}
                  {chat.unread > 0 ? (
                    <>
                      <span className="size-3 shrink-0 rounded-full bg-rose-deep" aria-hidden="true" />
                      <span className="sr-only">{t.unread(chat.unread)}</span>
                    </>
                  ) : null}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    {/* Shown on hover like Facebook's "…", always there for touch and keyboard. */}
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="absolute right-2 rounded-full shadow-sm md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
                      aria-label={`${t.actions}: ${chat.title}`}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => void togglePin(chat.id, chat.pinned)}>
                      {chat.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />} {chat.pinned ? t.unpin : t.pin}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => askDeleteChat({ id: chat.id, title: chat.title })} className="text-destructive focus:text-destructive">
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

/** Search box + matching people; used in the list's "new chat" view and the "new message" window. */
export function PeoplePicker({ onPick }: { onPick: (person: ChatPerson) => void }) {
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
      <div className="relative border-b p-3">
        <Search className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchLabel} className="rounded-full pl-9" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {people === null ? (
          <div className="flex justify-center p-6 text-muted-foreground">
            <Loader2 className="animate-spin" aria-hidden />
          </div>
        ) : people.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t.noPeople}</p>
        ) : (
          <ul className="grid gap-0.5">
            {people.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => onPick(person)}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
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
