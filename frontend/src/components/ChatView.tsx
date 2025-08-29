import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPrivateChat,
  createGroupChat,
  publishPublicKey,
  addMembers,
  removeMembers,
  renameGroup,
} from "../api";
import { getStoredPublicJwk } from "@/lib/e2ee";
//
import { getMe } from "@/api";
//
import { ChatMessages } from "./chat/ChatMessages";
import { ChatInput } from "./chat/ChatInput";
import { ChatPanel } from "./chat/ChatPanel";
//
import { AlertCircle } from "lucide-react";
import { ChatSidebar } from "./chat/ChatSidebar";
import { GroupDialog } from "./chat/GroupDialog";
import { GroupMembersDialog } from "./chat/GroupMembersDialog";
import { useGroupKey } from "@/hooks/useGroupKey";
import { useChatList } from "@/hooks/useChatList";
import { useNotifySocket } from "@/hooks/useNotifySocket";
import { useChatSocket } from "@/hooks/useChatSocket";

type Props = {
  token: string;
  onLogout: () => void;
};

// local ChatParticipant type was only used for inline type hints and is no longer needed
// Chat type is used only for typing in hooks; keeping local participant type

export function ChatView({ token, onLogout }: Props) {
  const {
    chats,
    approvedUsers,
    unreadMap,
    setUnreadMap,
    loadChats,
    refreshLists,
  } = useChatList(token);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeChatIdRef = useRef<number | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "groups">("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const [removedChatIds, setRemovedChatIds] = useState<Set<number>>(new Set());
  const [lastIncomingAt, setLastIncomingAt] = useState<Record<number, number>>(
    {}
  );
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const { ensureGroupKey, groupKeyRef } = useGroupKey(token);
  const {
    messages,
    messagesLoading,
    sendText,
    onSendAttachment,
    onDropFiles,
    firstUnreadIndex,
    appendSystemNotice,
  } = useChatSocket({
    token,
    activeChatId,
    chats: chats as any,
    myId,
    ensureGroupKey,
    groupKeyRef,
    setUnreadMap,
    setOnlineIds,
  });

  const loadChatsWithDefault = useCallback(async () => {
    const data = (await loadChats()) as any[];
    if (data && data.length > 0 && activeChatId == null)
      setActiveChatId(data[0].id);
  }, [loadChats, activeChatId]);

  useNotifySocket(token, {
    activeChatIdRef,
    onUnreadUpdate: (chatId) =>
      setUnreadMap((prev) => ({ ...prev, [chatId]: 0 })),
    onRemovedFromChat: (chatId) => {
      try {
        const curr = activeChatIdRef.current;
        if (curr && chatId === curr) {
          appendSystemNotice("הוסרת מקבוצה זו");
        }
        setRemovedChatIds((prev) => {
          const next = new Set(prev);
          if (typeof chatId === "number") next.add(chatId);
          return next;
        });
      } catch {}
    },
    onNewMessage: (chatId) => {
      setLastIncomingAt((prev) => ({ ...prev, [chatId]: Date.now() }));
      setUnreadMap((prev) => {
        const curr = activeChatIdRef.current;
        if (curr && chatId === curr) return prev;
        const next = { ...prev };
        next[chatId] = (next[chatId] ?? 0) + 1;
        return next;
      });
    },
    onUsersChanged: () => refreshLists(),
    onChatsChanged: () => refreshLists(),
  });

  useEffect(() => {
    loadChatsWithDefault();
  }, [loadChatsWithDefault]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    let handler: any;
    (async () => {
      // ensure public key published once crypto is ready
      const publish = async () => {
        try {
          const pub = await getStoredPublicJwk();
          if (pub) await publishPublicKey(token, JSON.stringify(pub));
        } catch {}
      };
      handler = () => publish();
      window.addEventListener("crypto-ready", handler);
      await publish();
      await refreshLists();
    })();
    return () => {
      try {
        if (handler) window.removeEventListener("crypto-ready", handler);
      } catch {}
    };
  }, [token, refreshLists]);

  // Hydrate lastIncomingAt from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chat_last_incoming");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setLastIncomingAt(parsed);
      }
    } catch {}
  }, []);

  // Persist lastIncomingAt to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(
        "chat_last_incoming",
        JSON.stringify(lastIncomingAt)
      );
    } catch {}
  }, [lastIncomingAt]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe(token);
        setMyId(me.id);
      } catch {}
    })();
  }, [token]);

  // Chat socket handled by useChatSocket

  const send = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      await sendText(text);
      setInput("");
      inputRef.current?.focus();
    },
    [input, sendText]
  );

  // unifiedItems moved into ChatSidebar

  return (
    <div className="w-screen h-screen overflow-hidden bg-background text-foreground grid grid-cols-[320px_1fr] gap-4 min-h-0 box-border p-2">
      <ChatSidebar
        chats={chats}
        approvedUsers={approvedUsers}
        activeChatId={activeChatId}
        setActiveChatId={(id) => setActiveChatId(id)}
        filterTab={filterTab}
        setFilterTab={setFilterTab}
        search={search}
        setSearch={setSearch}
        unreadMap={unreadMap}
        lastIncomingAt={lastIncomingAt}
        onlineIds={onlineIds}
        refreshing={refreshing}
        onRefresh={async () => {
          if (refreshing) return;
          setRefreshing(true);
          try {
            await refreshLists();
          } finally {
            setTimeout(() => setRefreshing(false), 250);
          }
        }}
        onOpenCreateGroup={() => setShowGroupDialog(true)}
        myId={myId}
        token={token}
        loadChats={loadChats}
        createPrivateChat={createPrivateChat}
        onLogout={onLogout}
      />

      <main className="p-4 flex flex-col min-h-0">
        <ChatPanel
          title={
            <>
              {(() => {
                if (!activeChatId) return "בחר צ'אט";
                const chat = chats.find((c: any) => c.id === activeChatId);
                if (!chat) return `חדר #${activeChatId}`;
                const typeLabel =
                  chat.chat_type === "private" ? "פרטי" : "קבוצה";
                const baseTitle = (chat as any).title
                  ? `${(chat as any).title} | ${typeLabel}`
                  : chat.chat_type === "private" &&
                    myId &&
                    Array.isArray(chat.participants)
                  ? (() => {
                      const other = chat.participants.find(
                        (p: any) => p.id !== myId
                      );
                      const name = other?.username ?? "לא ידוע";
                      return `צ'אט עם ${name} | ${typeLabel}`;
                    })()
                  : `צ'אט עם ${
                      chat.participants?.length ?? 0
                    } משתתפים | ${typeLabel}`;
                return (
                  <span className="inline-flex items-center gap-2">
                    {baseTitle}
                    {chat.chat_type === "group" && (
                      <button
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                        onClick={() => setShowMembersDialog(true)}
                        aria-label="פרטי קבוצה"
                      >
                        <AlertCircle className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                );
              })()}
            </>
          }
          footer={
            <ChatInput
              value={input}
              onChange={setInput}
              onSend={send}
              disabled={
                !activeChatId ||
                (activeChatId != null && removedChatIds.has(activeChatId))
              }
              onSendCode={async (code, language) => {
                // Wrap code in a fenced block for consistent rendering
                const fenced = language
                  ? `\u0060\u0060\u0060${language}\n${code}\n\u0060\u0060\u0060`
                  : `\u0060\u0060\u0060\n${code}\n\u0060\u0060\u0060`;
                setInput(fenced);
                // Trigger regular send
                const fake = { preventDefault: () => {} } as any;
                await send(fake);
              }}
              onSendAttachment={onSendAttachment}
            />
          }
          onDropFiles={onDropFiles}
        >
          {messagesLoading ? (
            <div className="w-full max-w-full flex-1 overflow-y-auto space-y-2 pr-2 pl-2 box-border animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-28 mx-auto my-3" />
              <div className="flex justify-start">
                <div className="bg-gray-200 dark:bg-neutral-800 rounded-2xl rounded-br-none h-10 w-2/3" />
              </div>
              <div className="flex justify-end">
                <div className="bg-gray-300 dark:bg-neutral-700 rounded-2xl rounded-bl-none h-6 w-1/2" />
              </div>
              <div className="flex justify-start">
                <div className="bg-gray-200 dark:bg-neutral-800 rounded-2xl rounded-br-none h-16 w-3/4" />
              </div>
              <div className="flex justify-end">
                <div className="bg-gray-300 dark:bg-neutral-700 rounded-2xl rounded-bl-none h-12 w-1/3" />
              </div>
            </div>
          ) : (
            <ChatMessages
              messages={messages}
              firstUnreadIndex={firstUnreadIndex}
              myId={myId}
              isGroup={(() => {
                const chat = chats.find((c: any) => c.id === activeChatId);
                return chat?.chat_type === "group";
              })()}
              token={token}
              chatId={activeChatId}
              otherUserId={(() => {
                const chat = chats.find((c: any) => c.id === activeChatId);
                if (!chat) return null;
                if (chat.chat_type === "private") {
                  const other = chat.participants.find(
                    (p: any) => p.id !== myId
                  );
                  return other?.id ?? myId ?? null;
                }
                return null;
              })()}
            />
          )}
        </ChatPanel>

        {/* footer moved into ChatPanel */}
      </main>
      <GroupDialog
        open={showGroupDialog}
        onOpenChange={(open) => setShowGroupDialog(open)}
        approvedUsers={approvedUsers}
        creating={creatingGroup}
        onCreate={async (name, ids) => {
          if (creatingGroup) return;
          setCreatingGroup(true);
          try {
            const chat = await createGroupChat(token, ids, name);
            await loadChats();
            setActiveChatId(chat.id);
            setShowGroupDialog(false);
          } finally {
            setCreatingGroup(false);
          }
        }}
      />
      <GroupMembersDialog
        open={showMembersDialog}
        onOpenChange={(open) => setShowMembersDialog(open)}
        chat={chats.find((c: any) => c.id === activeChatId) || null}
        myId={myId}
        approvedUsers={approvedUsers}
        onRename={async (name) => {
          const chat = chats.find((c: any) => c.id === activeChatId);
          if (!chat) return;
          await renameGroup(token, chat.id, name);
          await loadChats();
        }}
        onAddMembers={async (ids) => {
          const chat = chats.find((c: any) => c.id === activeChatId);
          if (!chat) return;
          await addMembers(token, chat.id, ids);
          await loadChats();
        }}
        onRemoveMember={async (id) => {
          const chat = chats.find((c: any) => c.id === activeChatId);
          if (!chat) return;
          await removeMembers(token, chat.id, [id]);
          await loadChats();
        }}
      />
    </div>
  );
}
