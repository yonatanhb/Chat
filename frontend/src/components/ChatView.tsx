import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  API_BASE,
  buildWsUrl,
  getChats,
  createPrivateChat,
  createGroupChat,
  getApprovedPeers,
  getChatMessages,
  getReadState,
  setReadState,
  getPublicKey,
  publishPublicKey,
  addMembers,
  removeMembers,
  publishGroupKeyWrap,
  getGroupKeyWrap,
  getUnreadCounts,
  buildNotifyWsUrl,
  renameGroup,
  uploadEncryptedFile,
  sendMessageWithAttachment,
} from "../api";
import {
  getStoredPublicJwk,
  getSharedKeyWithUser,
  encryptTextAesGcm,
  decryptTextAesGcm,
  loadGroupKey,
  saveGroupKey,
  generateGroupKey,
  exportGroupKeyRaw,
  importGroupKeyRaw,
  encryptBytesAesGcm,
  decryptBytesAesGcm,
} from "@/lib/e2ee";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMe } from "@/api";
import { RefreshCcw } from "lucide-react";
import { MdOutlineGroupAdd } from "react-icons/md";
import { ChatMessages } from "./chat/ChatMessages";
import { ChatInput } from "./chat/ChatInput";
import { ChatPanel } from "./chat/ChatPanel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";

type Props = {
  token: string;
  onLogout: () => void;
};

type ChatParticipant = { id: number; username: string };
type Chat = {
  id: number;
  chat_type: string;
  participants: ChatParticipant[];
  title?: string;
  name?: string | null;
  admin_user_id?: number | null;
};

export function ChatView({ token, onLogout }: Props) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<
    Array<{
      id: number;
      content: string | null;
      content_type?: string;
      sender?: { id: number; username: string };
      timestamp?: string;
      attachment?: {
        id: number;
        filename: string;
        mime_type: string;
        size_bytes: number;
        nonce: string;
        algo: string;
      } | null;
    }>
  >([]);
  const [baselineReadId, setBaselineReadId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [showUnreadDivider, setShowUnreadDivider] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const notifyWsRef = useRef<WebSocket | null>(null);
  const activeChatIdRef = useRef<number | null>(null);
  const pendingRef = useRef<Array<{ chatId: number; text: string }>>([]);
  const [approvedUsers, setApprovedUsers] = useState<
    Array<{
      user_id: number;
      username: string;
      chat_id?: number | null;
      is_self: boolean;
    }>
  >([]);
  const [myId, setMyId] = useState<number | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "groups">("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const [unreadMap, setUnreadMap] = useState<Record<number, number>>({});
  const [removedChatIds, setRemovedChatIds] = useState<Set<number>>(new Set());
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(
    new Set()
  );
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const groupKeyRef = useRef<CryptoKey | null>(null);

  const authHeader = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const loadChats = useCallback(async () => {
    const data = await getChats(token);
    setChats(data);
    if (data.length > 0 && activeChatId == null) setActiveChatId(data[0].id);
  }, [token, activeChatId]);

  const refreshLists = useCallback(async () => {
    await loadChats();
    try {
      const peers = await getApprovedPeers(token);
      setApprovedUsers(peers);
      const counts = await getUnreadCounts(token);
      const map: Record<number, number> = {};
      for (const r of counts) map[r.chat_id] = r.unread_count;
      setUnreadMap(map);
    } catch {}
  }, [loadChats, token]);

  const openNotifySocket = useCallback(() => {
    try {
      if (
        notifyWsRef.current &&
        (notifyWsRef.current.readyState === WebSocket.OPEN ||
          notifyWsRef.current.readyState === WebSocket.CONNECTING)
      )
        return;
      const nws = new WebSocket(buildNotifyWsUrl(token));
      notifyWsRef.current = nws;
      nws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data?.type === "unread_update") {
            setUnreadMap((prev) => ({ ...prev, [data.chat_id]: 0 }));
          } else if (data?.type === "removed_from_chat") {
            try {
              const curr = activeChatIdRef.current;
              if (curr && data.chat_id === curr) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: Date.now(),
                    content: "הוסרת מקבוצה זו",
                    timestamp: new Date().toISOString(),
                  },
                ]);
              }
              setRemovedChatIds((prev) => {
                const next = new Set(prev);
                if (typeof data.chat_id === "number") next.add(data.chat_id);
                return next;
              });
            } catch {}
          } else if (data?.type === "new_message") {
            setUnreadMap((prev) => {
              const curr = activeChatIdRef.current;
              if (curr && data.chat_id === curr) return prev;
              const next = { ...prev };
              next[data.chat_id] = (next[data.chat_id] ?? 0) + 1;
              return next;
            });
          } else if (data?.type === "users_changed") {
            refreshLists();
            (async () => {
              try {
                const pub = await getStoredPublicJwk();
                if (pub) await publishPublicKey(token, JSON.stringify(pub));
              } catch {}
            })();
          } else if (data?.type === "chats_changed") {
            refreshLists();
          }
        } catch {}
      };
      nws.onclose = () => {
        // do not retry to avoid spamming server on auth errors
      };
      nws.onerror = () => {
        try {
          nws.close();
        } catch {}
      };
    } catch {}
  }, [token]);

  useEffect(() => {
    loadChats();
    openNotifySocket();
    return () => {
      try {
        notifyWsRef.current?.close();
      } catch {}
    };
  }, [loadChats, openNotifySocket]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    let handler: any;
    (async () => {
      try {
        const peers = await getApprovedPeers(token);
        setApprovedUsers(peers);
      } catch {}
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
    })();
    return () => {
      try {
        if (handler) window.removeEventListener("crypto-ready", handler);
      } catch {}
    };
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe(token);
        setMyId(me.id);
      } catch {}
    })();
  }, [token]);

  const ensureGroupKey = useCallback(
    async (chat: Chat) => {
      if (chat.chat_type !== "group") {
        groupKeyRef.current = null;
        return null;
      }
      // try load existing
      const loaded = await loadGroupKey(chat.id);
      if (loaded) {
        groupKeyRef.current = loaded;
        return loaded;
      }
      // try fetch wrapped key for me
      try {
        const wrap = await getGroupKeyWrap(token, chat.id);
        // derive shared with provider
        const providerKey = await getPublicKey(token, wrap.provider_user_id);
        const shared = await getSharedKeyWithUser(
          wrap.provider_user_id,
          JSON.parse(providerKey.public_key_jwk)
        );
        const raw = await decryptBytesAesGcm(
          wrap.wrapped_key_ciphertext,
          wrap.wrapped_key_nonce,
          shared
        );
        const key = await importGroupKeyRaw(raw);
        await saveGroupKey(chat.id, key);
        groupKeyRef.current = key;
        return key;
      } catch {}
      // simple retry a couple of times in case admin just published
      for (let i = 0; i < 2; i++) {
        try {
          await new Promise((r) => setTimeout(r, 1200));
          const wrap = await getGroupKeyWrap(token, chat.id);
          const providerKey = await getPublicKey(token, wrap.provider_user_id);
          const shared = await getSharedKeyWithUser(
            wrap.provider_user_id,
            JSON.parse(providerKey.public_key_jwk)
          );
          const raw = await decryptBytesAesGcm(
            wrap.wrapped_key_ciphertext,
            wrap.wrapped_key_nonce,
            shared
          );
          const key = await importGroupKeyRaw(raw);
          await saveGroupKey(chat.id, key);
          groupKeyRef.current = key;
          return key;
        } catch {}
      }
      // if I'm admin, generate and distribute
      if (chat.admin_user_id && myId && chat.admin_user_id === myId) {
        const key = await generateGroupKey();
        await saveGroupKey(chat.id, key);
        groupKeyRef.current = key;
        // export raw and wrap for each member
        const raw = await exportGroupKeyRaw(key);
        for (const p of chat.participants) {
          if (p.id === myId) continue;
          try {
            const pk = await getPublicKey(token, p.id);
            const shared = await getSharedKeyWithUser(
              p.id,
              JSON.parse(pk.public_key_jwk)
            );
            const wrapped = await encryptBytesAesGcm(raw, shared);
            await publishGroupKeyWrap(
              token,
              chat.id,
              p.id,
              wrapped.ciphertextB64,
              wrapped.nonceB64,
              wrapped.algo
            );
          } catch {}
        }
        return key;
      }
      return null;
    },
    [token, myId]
  );

  useEffect(() => {
    if (activeChatId == null) return;
    // Hide unread count when entering this chat
    setUnreadMap((prev) => ({ ...prev, [activeChatId]: 0 }));
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const ws = new WebSocket(buildWsUrl(activeChatId, token));
    wsRef.current = ws;
    setMessages([]);
    // Load history first
    (async () => {
      try {
        const history = await getChatMessages(token, activeChatId);
        let items = history;
        const chat = chats.find((c) => c.id === activeChatId);
        if (
          chat &&
          (chat.chat_type === "private" || chat.chat_type === "group")
        ) {
          const other =
            chat.participants.find((p) => p.id !== myId) ||
            (myId != null ? ({ id: myId } as any) : null);
          if (chat.chat_type === "private") {
            if (other) {
              try {
                const keyRec = await getPublicKey(token, other.id);
                const shared = await getSharedKeyWithUser(
                  other.id,
                  JSON.parse(keyRec.public_key_jwk)
                );
                items = await Promise.all(
                  history.map(async (m) => {
                    if (m.ciphertext && m.nonce) {
                      try {
                        const text = await decryptTextAesGcm(
                          m.ciphertext,
                          m.nonce,
                          shared
                        );
                        return { ...m, content: text };
                      } catch {
                        return m;
                      }
                    }
                    return m;
                  })
                );
              } catch {}
            }
          } else if (chat.chat_type === "group") {
            const key = await ensureGroupKey(chat);
            if (key) {
              items = await Promise.all(
                history.map(async (m) => {
                  if (m.ciphertext && m.nonce) {
                    try {
                      const text = await decryptTextAesGcm(
                        m.ciphertext,
                        m.nonce,
                        key
                      );
                      return { ...m, content: text };
                    } catch {
                      return m as any;
                    }
                  }
                  return m as any;
                })
              );
            }
          }
        }
        setMessages(
          items.map((m) => ({
            id: m.id,
            content: m.content as any,
            content_type: (m as any).content_type as any,
            sender: m.sender,
            timestamp: (m as any).timestamp as string,
            attachment: (m as any).attachment ?? null,
          }))
        );
        try {
          const rs = await getReadState(token, activeChatId);
          setBaselineReadId(rs.last_read_message_id);
          const lastId = history.length ? history[history.length - 1].id : null;
          setShowUnreadDivider(
            !!(
              lastId != null &&
              rs.last_read_message_id != null &&
              lastId > rs.last_read_message_id
            )
          );
          // Mark read on enter to reset server unread counts
          if (lastId != null) {
            try {
              const updated = await setReadState(token, activeChatId, lastId);
              setBaselineReadId(updated.last_read_message_id);
              setShowUnreadDivider(false);
              setUnreadMap((prev) => ({ ...prev, [activeChatId]: 0 }));
            } catch {}
          }
        } catch {}
      } catch {}
    })();
    ws.onopen = () => {
      // flush any pending messages queued for this chat while connecting
      const remain: Array<{ chatId: number; text: string }> = [];
      for (const msg of pendingRef.current) {
        if (msg.chatId === activeChatId) {
          try {
            ws.send(
              JSON.stringify({ content: msg.text, content_type: "text" })
            );
          } catch {}
        } else {
          remain.push(msg);
        }
      }
      pendingRef.current = remain;
    };
    ws.onmessage = async (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (
          data?.type === "presence_snapshot" &&
          Array.isArray(data.online_user_ids)
        ) {
          setOnlineIds(new Set<number>(data.online_user_ids));
        }
        if (data?.type === "presence" && typeof data.user_id === "number") {
          setOnlineIds((prev) => {
            const next = new Set(prev);
            if (data.online) next.add(data.user_id);
            else next.delete(data.user_id);
            return next;
          });
        }
        if (data?.type === "message" && data?.chat_id === activeChatId) {
          const chat = chats.find((c) => c.id === activeChatId);
          let content = data.message?.content as string | null;
          if (!content && chat) {
            if (
              chat.chat_type === "private" &&
              data.message?.ciphertext &&
              data.message?.nonce
            ) {
              const other =
                chat.participants.find((p) => p.id !== myId) ||
                (myId != null ? ({ id: myId } as any) : null);
              if (other) {
                try {
                  const keyRec = await getPublicKey(token, other.id);
                  const shared = await getSharedKeyWithUser(
                    other.id,
                    JSON.parse(keyRec.public_key_jwk)
                  );
                  content = await decryptTextAesGcm(
                    data.message.ciphertext,
                    data.message.nonce,
                    shared
                  );
                } catch {}
              }
            } else if (chat.chat_type === "group") {
              // Decrypt with group key (all participants share the same key)
              const key = groupKeyRef.current || (await ensureGroupKey(chat));
              if (key && data.message?.ciphertext && data.message?.nonce) {
                try {
                  content = await decryptTextAesGcm(
                    data.message.ciphertext,
                    data.message.nonce,
                    key
                  );
                } catch {}
              }
            }
          }
          const newId = data.message?.id ?? Date.now();
          const ts = data.message?.timestamp as string | undefined;
          setMessages((prev) => [
            ...prev,
            {
              id: newId,
              content: content ?? null,
              content_type: data.message?.content_type,
              sender: data.message?.sender,
              timestamp: ts,
              attachment: data.message?.attachment ?? null,
            },
          ]);
          // Auto-mark as read while inside the chat without changing the baseline divider
          try {
            await setReadState(token, activeChatId, newId);
          } catch {}
        }
      } catch {
        // fallback: append raw text
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            content: String(evt.data),
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
    return () => ws.close();
  }, [activeChatId, token]);

  const send = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!activeChatId || !text) return;
      // send via HTTP to persist regardless of websocket state
      try {
        // If private chat, encrypt using peer public key
        let payload = { content: text, content_type: "text" as const } as any;
        const chat = chats.find((c) => c.id === activeChatId);
        if (
          chat &&
          (chat.chat_type === "private" || chat.chat_type === "group")
        ) {
          // determine peer id
          if (chat.chat_type === "private") {
            const other =
              chat.participants.find((p) => p.id !== myId) ||
              (myId != null ? ({ id: myId } as any) : null);
            if (other) {
              const keyRec = await getPublicKey(token, other.id);
              const shared = await getSharedKeyWithUser(
                other.id,
                JSON.parse(keyRec.public_key_jwk)
              );
              const enc = await encryptTextAesGcm(text, shared);
              payload = {
                content: null,
                content_type: "text",
                ciphertext: enc.ciphertextB64,
                nonce: enc.nonceB64,
                algo: enc.algo,
              };
            }
          } else if (chat.chat_type === "group") {
            // Encrypt once with shared group key so all members can read
            const key = groupKeyRef.current || (await ensureGroupKey(chat));
            if (!key) throw new Error("Group key not available");
            const enc = await encryptTextAesGcm(text, key);
            payload = {
              content: null,
              content_type: "text",
              ciphertext: enc.ciphertextB64,
              nonce: enc.nonceB64,
              algo: enc.algo,
            };
          }
        }
        const saved = await fetch(
          `${API_BASE}/chats/${activeChatId}/messages`,
          {
            method: "POST",
            headers: {
              ...authHeader,
              "Content-Type": "application/json",
            } as any,
            body: JSON.stringify(payload),
          }
        ).then((r) => r.json());
        // Do not append locally to avoid duplicates; WS event will arrive and append once
        // mark read using the DB message id to avoid overflow
        try {
          await setReadState(token, activeChatId, saved.id);
          setBaselineReadId(saved.id);
          setShowUnreadDivider(false);
        } catch {}
      } catch {
        // fallback to websocket queue if HTTP fails
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ content: text, content_type: "text" }));
          } catch {}
        } else {
          pendingRef.current.push({ chatId: activeChatId, text });
        }
      }
      setInput("");
      // focus back after send
      inputRef.current?.focus();
    },
    [input, activeChatId, messages, token]
  );

  const unifiedItems = useMemo(() => {
    // Build group entries from chats
    const groups = (chats as any[])
      .filter((c) => c.chat_type === "group")
      .map((c) => ({
        kind: "group" as const,
        chatId: c.id,
        displayName: (c as any).title || `קבוצה #${c.id}`,
      }));

    // Build private entries from approved users
    const privates = approvedUsers.map((u) => ({
      kind: "private" as const,
      userId: u.user_id,
      displayName: u.is_self ? "צ'אט עם עצמי" : u.username,
      chatId: u.chat_id ?? undefined,
    }));

    let items = filterTab === "groups" ? groups : [...privates, ...groups];

    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter((it) => it.displayName.toLowerCase().includes(q));
    }
    return items;
  }, [approvedUsers, chats, filterTab, search, myId]);

  const firstUnreadIndex = useMemo(() => {
    if (!showUnreadDivider) return -1;
    if (baselineReadId == null) return -1;
    return messages.findIndex((m) => m.id > baselineReadId);
  }, [messages, baselineReadId, showUnreadDivider]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-white grid grid-cols-[320px_1fr] gap-4 min-h-0 box-border p-2">
      <aside className="border-l p-4 space-y-3 min-h-0 overflow-y-auto flex flex-col">
        <Card className="shrink-0">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>צ'אטים</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (refreshing) return;
                  setRefreshing(true);
                  try {
                    await refreshLists();
                  } finally {
                    // leave a tiny delay so the spin is noticeable
                    setTimeout(() => setRefreshing(false), 250);
                  }
                }}
                aria-label="רענן"
                disabled={refreshing}
              >
                <RefreshCcw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowGroupDialog(true);
                }}
                aria-label="צור קבוצה"
              >
                <MdOutlineGroupAdd className={`h-4 w-4`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-2 space-y-2">
            <div className="flex gap-2 items-center">
              <Button
                variant={filterTab === "all" ? "default" : "ghost"}
                onClick={() => setFilterTab("all")}
              >
                הכל
              </Button>
              <Button
                variant={filterTab === "groups" ? "default" : "ghost"}
                onClick={() => setFilterTab("groups")}
              >
                קבוצות
              </Button>
            </div>
            <Input
              placeholder="חיפוש לפי שם משתמש או שם צ'אט"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="space-y-1">
              {unifiedItems.map((it) => {
                const key =
                  (it as any).kind === "group"
                    ? `group-${(it as any).chatId}`
                    : `private-${(it as any).userId}-${
                        (it as any).chatId ?? "new"
                      }`;
                return (
                  <li key={key}>
                    <Button
                      variant={
                        "chatId" in it &&
                        (it as any).chatId &&
                        activeChatId === (it as any).chatId
                          ? "default"
                          : "ghost"
                      }
                      className="w-full justify-between"
                      onClick={async () => {
                        if ((it as any).kind === "group") {
                          setActiveChatId((it as any).chatId);
                        } else {
                          const existing = (it as any).chatId;
                          if (existing) {
                            setActiveChatId(existing);
                          } else {
                            const chat = await createPrivateChat(
                              token,
                              (it as any).userId
                            );
                            setActiveChatId(chat.id);
                            await loadChats();
                          }
                        }
                      }}
                    >
                      <span className="inline-flex items-center">
                        {(it as any).kind === "private" && (
                          <span
                            className={`ml-2 inline-block h-2 w-2 rounded-full ${
                              onlineIds.has((it as any).userId)
                                ? "bg-emerald-500"
                                : "bg-gray-300"
                            }`}
                          />
                        )}
                        {it.displayName}
                        {(it as any).kind === "group" ? " · קבוצה" : ""}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {"chatId" in it &&
                        (it as any).chatId &&
                        unreadMap[(it as any).chatId]
                          ? unreadMap[(it as any).chatId]
                          : ""}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        <div className="mt-auto">
          <Button className="w-full" variant="outline" onClick={onLogout}>
            יציאה
          </Button>
        </div>
      </aside>

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
              onSendAttachment={async (file) => {
                if (!activeChatId) return;
                const chat = chats.find((c) => c.id === activeChatId);
                if (!chat) return;
                // Derive key (private or group)
                let key: CryptoKey | null = null;
                if (chat.chat_type === "private") {
                  const other =
                    chat.participants.find((p) => p.id !== myId) ||
                    (myId != null ? ({ id: myId } as any) : null);
                  if (other) {
                    const keyRec = await getPublicKey(token, other.id);
                    key = await getSharedKeyWithUser(
                      other.id,
                      JSON.parse(keyRec.public_key_jwk)
                    );
                  }
                } else if (chat.chat_type === "group") {
                  key = (await (loadGroupKey(chat.id) ||
                    ensureGroupKey(chat))) as any;
                  if (!(key instanceof CryptoKey))
                    key = await ensureGroupKey(chat);
                }
                if (!key) throw new Error("Missing encryption key");
                // Read and encrypt
                const buf = new Uint8Array(await file.arrayBuffer());
                const enc = await encryptBytesAesGcm(buf, key);
                // Upload encrypted blob
                const att = await uploadEncryptedFile(
                  token,
                  Uint8Array.from(atob(enc.ciphertextB64), (c) =>
                    c.charCodeAt(0)
                  ),
                  file.name,
                  file.type || "application/octet-stream",
                  enc.nonceB64
                );
                // Decide content type
                let ctype: "image" | "video" | "file" = "file";
                if ((file.type || "").startsWith("image/")) ctype = "image";
                else if ((file.type || "").startsWith("video/"))
                  ctype = "video";
                // Send message with attachment and (optionally) encrypted text null
                await sendMessageWithAttachment(
                  token,
                  activeChatId,
                  att.id,
                  ctype
                );
              }}
            />
          }
          onDropFiles={async (files) => {
            const f = files[0];
            if (!f) return;
            const fakeInput = { preventDefault: () => {} } as any;
            // Reuse the same flow as button attach
            await (async () => {
              if (!activeChatId) return;
              const chat = chats.find((c) => c.id === activeChatId);
              if (!chat) return;
              let key: CryptoKey | null = null;
              if (chat.chat_type === "private") {
                const other =
                  chat.participants.find((p) => p.id !== myId) ||
                  (myId != null ? ({ id: myId } as any) : null);
                if (other) {
                  const keyRec = await getPublicKey(token, other.id);
                  key = await getSharedKeyWithUser(
                    other.id,
                    JSON.parse(keyRec.public_key_jwk)
                  );
                }
              } else if (chat.chat_type === "group") {
                key = (await (loadGroupKey(chat.id) ||
                  ensureGroupKey(chat))) as any;
                if (!(key instanceof CryptoKey))
                  key = await ensureGroupKey(chat);
              }
              if (!key) throw new Error("Missing encryption key");
              const buf = new Uint8Array(await f.arrayBuffer());
              const enc = await encryptBytesAesGcm(buf, key);
              const att = await uploadEncryptedFile(
                token,
                Uint8Array.from(atob(enc.ciphertextB64), (c) =>
                  c.charCodeAt(0)
                ),
                f.name,
                f.type || "application/octet-stream",
                enc.nonceB64
              );
              let ctype: "image" | "video" | "file" = "file";
              if ((f.type || "").startsWith("image/")) ctype = "image";
              else if ((f.type || "").startsWith("video/")) ctype = "video";
              await sendMessageWithAttachment(
                token,
                activeChatId,
                att.id,
                ctype
              );
            })();
            await send(fakeInput);
          }}
        >
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
                const other = chat.participants.find((p: any) => p.id !== myId);
                return other?.id ?? myId ?? null;
              }
              return null;
            })()}
          />
        </ChatPanel>

        {/* machine info removed */}

        {/* footer moved into ChatPanel */}
      </main>
      <Dialog
        open={showGroupDialog}
        onOpenChange={(open) => {
          setShowGroupDialog(open);
          if (!open) {
            setGroupName("");
            setSelectedUserIds(new Set());
            setCreatingGroup(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>יצירת קבוצה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">תן שם לקבוצה</label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="שם הקבוצה"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">בחר משתתפים</span>
                <span className="text-xs text-muted-foreground">
                  נבחרו {selectedUserIds.size}
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-1">
                {approvedUsers
                  .filter((u) => !u.is_self)
                  .map((u) => {
                    const active = selectedUserIds.has(u.user_id);
                    return (
                      <button
                        key={u.user_id}
                        className={`w-full text-right px-2 py-1 rounded ${
                          active ? "bg-blue-100" : "hover:bg-gray-50"
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedUserIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(u.user_id)) next.delete(u.user_id);
                            else next.add(u.user_id);
                            return next;
                          });
                        }}
                      >
                        {u.username}
                      </button>
                    );
                  })}
                {approvedUsers.filter((u) => !u.is_self).length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    אין משתמשים זמינים
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowGroupDialog(false)}>
              ביטול
            </Button>
            <Button
              disabled={creatingGroup || !groupName.trim()}
              onClick={async () => {
                if (creatingGroup) return;
                setCreatingGroup(true);
                try {
                  const ids = Array.from(selectedUserIds);
                  const chat = await createGroupChat(
                    token,
                    ids,
                    groupName.trim()
                  );
                  await loadChats();
                  setActiveChatId(chat.id);
                  setShowGroupDialog(false);
                } catch (e) {
                } finally {
                  setCreatingGroup(false);
                }
              }}
            >
              צור קבוצה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={showMembersDialog}
        onOpenChange={(open) => setShowMembersDialog(open)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>פרטי קבוצה</DialogTitle>
          </DialogHeader>
          {(() => {
            const chat = chats.find((c: any) => c.id === activeChatId);
            const isAdmin = Boolean(
              chat &&
                (chat as any).chat_type === "group" &&
                (chat as any).admin_user_id === myId
            );
            const members = chat?.participants ?? [];
            const otherUsers = approvedUsers.filter(
              (u) => !u.is_self && !members.some((m: any) => m.id === u.user_id)
            );
            return (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="text-sm">שם קבוצה</div>
                  <div className="flex gap-2 items-center">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      placeholder={chat?.name ?? chat?.title ?? ""}
                      disabled={!isAdmin}
                    />
                    {isAdmin && (
                      <Button
                        size="sm"
                        disabled={renaming || !renameValue.trim()}
                        onClick={async () => {
                          if (!chat) return;
                          setRenaming(true);
                          try {
                            await renameGroup(
                              token,
                              chat.id,
                              renameValue.trim()
                            );
                            await loadChats();
                            setRenameValue("");
                          } catch {}
                          setRenaming(false);
                        }}
                      >
                        שנה
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm">חברים</div>
                  <ul className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                    {members.map((m: any) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between"
                      >
                        <span>{m.username}</span>
                        {isAdmin && m.id !== myId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                await removeMembers(token, chat!.id, [m.id]);
                                await loadChats();
                              } catch {}
                            }}
                          >
                            הסר
                          </Button>
                        )}
                      </li>
                    ))}
                    {members.length === 0 && (
                      <li className="text-sm text-muted-foreground">
                        אין משתתפים
                      </li>
                    )}
                  </ul>
                </div>
                {isAdmin && (
                  <div className="space-y-2">
                    <div className="text-sm">הוסף משתתפים</div>
                    <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                      {otherUsers.map((u) => (
                        <button
                          key={u.user_id}
                          className="w-full text-right px-2 py-1 rounded hover:bg-gray-50"
                          onClick={async () => {
                            try {
                              await addMembers(token, chat!.id, [u.user_id]);
                              await loadChats();
                            } catch {}
                          }}
                        >
                          {u.username}
                        </button>
                      ))}
                      {otherUsers.length === 0 && (
                        <div className="text-sm text-muted-foreground">
                          אין משתמשים זמינים להוספה
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMembersDialog(false)}
            >
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
