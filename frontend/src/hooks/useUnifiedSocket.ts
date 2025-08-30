import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  API_BASE,
  getChatMessages,
  getPublicKey,
  setReadState,
  uploadEncryptedFile,
} from "@/api";
import {
  decryptTextAesGcm,
  encryptBytesAesGcm,
  encryptTextAesGcm,
  getSharedKeyWithUser,
  loadGroupKey,
} from "@/lib/e2ee";

type Chat = {
  id: number;
  chat_type: string;
  participants: { id: number; username: string }[];
  title?: string;
  name?: string | null;
  admin_user_id?: number | null;
};

export function useUnifiedSocket({
  token,
  activeChatId,
  chats,
  myId,
  ensureGroupKey,
  groupKeyRef,
  setUnreadMap,
  setOnlineIds,
  onUsersChanged,
  onChatsChanged,
  onNewMessage,
  onUnreadUpdate,
  onRemovedFromChat,
}: {
  token: string;
  activeChatId: number | null;
  chats: Chat[];
  myId: number | null;
  ensureGroupKey: (
    chat: Chat,
    myId: number | null
  ) => Promise<CryptoKey | null>;
  groupKeyRef: React.MutableRefObject<CryptoKey | null>;
  setUnreadMap: (
    updater: (prev: Record<number, number>) => Record<number, number>
  ) => void;
  setOnlineIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  onUsersChanged: () => void;
  onChatsChanged: () => void;
  onNewMessage?: (chatId: number) => void;
  onUnreadUpdate?: (chatId: number) => void;
  onRemovedFromChat?: (chatId: number) => void;
}) {
  const queryClient = useQueryClient();
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
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [baselineReadId, setBaselineReadId] = useState<number | null>(null);
  const [showUnreadDivider, setShowUnreadDivider] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const sendQueueRef = useRef<string[]>([]);
  const prevSubRef = useRef<number | null>(null);
  const lastSubAckRef = useRef<number | null>(null);
  const chatsRef = useRef<Chat[]>(chats);
  const activeChatIdRef = useRef<number | null>(activeChatId);
  const myIdRef = useRef<number | null>(myId);
  const handlersRef = useRef({
    onUsersChanged,
    onChatsChanged,
    onNewMessage,
    onUnreadUpdate,
    onRemovedFromChat,
  });
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);
  useEffect(() => {
    handlersRef.current = {
      onUsersChanged,
      onChatsChanged,
      onNewMessage,
      onUnreadUpdate,
      onRemovedFromChat,
    };
  }, [
    onUsersChanged,
    onChatsChanged,
    onNewMessage,
    onUnreadUpdate,
    onRemovedFromChat,
  ]);

  const wsUrl = useMemo(
    () =>
      `${API_BASE.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(
        token
      )}`,
    [token]
  );

  // Open unified socket
  useEffect(() => {
    let socket: WebSocket | null = null;
    try {
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      )
        return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      socket = ws;
      try {
        console.info("WS: connecting", { url: wsUrl });
      } catch {}
      ws.onopen = () => {
        try {
          console.info("WS: open");
        } catch {}
        // Subscribe to current active chat on connect/reconnect
        try {
          const curr = activeChatIdRef.current;
          if (curr) {
            ws.send(JSON.stringify({ v: 1, type: "subscribe", chat_id: curr }));
            prevSubRef.current = curr;
            try {
              console.info("WS: subscribe (onopen)", { chatId: curr });
            } catch {}
            try {
              setUnreadMap((prev) => ({ ...prev, [curr]: 0 }));
            } catch {}
          }
        } catch {}

        // Note: We don't need to subscribe to other chats
        // The server automatically sends new_message events to all participants
        // This prevents unnecessary subscriptions and potential errors
        // Fallback: if no server ack yet, retry subscribe shortly after open
        try {
          setTimeout(() => {
            try {
              const want = activeChatIdRef.current;
              if (
                want &&
                lastSubAckRef.current !== want &&
                ws.readyState === WebSocket.OPEN
              ) {
                ws.send(
                  JSON.stringify({ v: 1, type: "subscribe", chat_id: want })
                );
                prevSubRef.current = want;
                try {
                  console.info("WS: subscribe (retry)", { chatId: want });
                } catch {}
              }
            } catch {}
          }, 250);
        } catch {}
        // Flush any queued messages
        try {
          const q = sendQueueRef.current;
          const queuedCount = q.length;
          while (q.length) {
            const msg = q.shift();
            if (msg) ws.send(msg);
          }
          try {
            console.info("WS: flushed queue", { count: queuedCount });
          } catch {}
        } catch {}
      };
      ws.onmessage = async (evt) => {
        try {
          const data = JSON.parse(evt.data);
          try {
            console.debug("WS: message", {
              type: data?.type,
              chatId: data?.chat_id,
            });
          } catch {}
          if (
            data?.type === "presence_snapshot" &&
            Array.isArray(data.online_user_ids)
          ) {
            setOnlineIds(new Set<number>(data.online_user_ids));
            return;
          }
          if (data?.type === "presence" && typeof data.user_id === "number") {
            setOnlineIds((prev) => {
              const next = new Set(prev);
              if (data.online) next.add(data.user_id);
              else next.delete(data.user_id);
              return next;
            });
            return;
          }
          if (data?.type === "users_changed") {
            handlersRef.current.onUsersChanged();
            return;
          }
          if (data?.type === "subscribed" && typeof data.chat_id === "number") {
            try {
              console.info("WS: subscribed (server ack)", {
                chatId: data.chat_id,
              });
            } catch {}
            lastSubAckRef.current = data.chat_id;
            return;
          }
          if (
            data?.type === "unsubscribed" &&
            typeof data.chat_id === "number"
          ) {
            try {
              console.info("WS: unsubscribed (server ack)", {
                chatId: data.chat_id,
              });
            } catch {}
            return;
          }
          if (data?.type === "chats_changed") {
            handlersRef.current.onChatsChanged();
            return;
          }
          if (
            data?.type === "unread_update" &&
            typeof data.chat_id === "number"
          ) {
            handlersRef.current.onUnreadUpdate?.(data.chat_id);
            return;
          }
          if (
            data?.type === "removed_from_chat" &&
            typeof data.chat_id === "number"
          ) {
            handlersRef.current.onRemovedFromChat?.(data.chat_id);
            return;
          }
          if (
            data?.type === "new_message" &&
            typeof data.chat_id === "number"
          ) {
            const curr = activeChatIdRef.current;
            if (!curr || curr !== data.chat_id) {
              // Instead of incrementing by 1, let's get the actual count from the server
              // This ensures accuracy and prevents drift
              try {
                // Get current unread counts from cache
                const currentUnreadCounts = queryClient.getQueryData([
                  "unreadCounts",
                  token,
                ]) as Record<number, number> | undefined;

                // Increment by 1 for now, but we'll sync with server data later
                const newCount = (currentUnreadCounts?.[data.chat_id] ?? 0) + 1;

                setUnreadMap((prev) => ({
                  ...prev,
                  [data.chat_id]: newCount,
                }));
              } catch {
                // Fallback to simple increment if cache access fails
                setUnreadMap((prev) => ({
                  ...prev,
                  [data.chat_id]: (prev[data.chat_id] ?? 0) + 1,
                }));
              }

              handlersRef.current.onNewMessage?.(data.chat_id);
            }
            return;
          }
          if (data?.type === "message" && typeof data.chat_id === "number") {
            const chatId = data.chat_id as number;
            const chat = chatsRef.current.find((c) => c.id === chatId);
            let content = data.message?.content as string | null;
            if (!content && chat) {
              if (
                chat.chat_type === "private" &&
                data.message?.ciphertext &&
                data.message?.nonce
              ) {
                const other =
                  chat.participants.find((p) => p.id !== myIdRef.current) ||
                  (myIdRef.current != null
                    ? ({ id: myIdRef.current } as any)
                    : null);
                if (other) {
                  try {
                    const keyRec = await getPublicKey(token, (other as any).id);
                    const shared = await getSharedKeyWithUser(
                      (other as any).id,
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
                const key =
                  groupKeyRef.current ||
                  (await ensureGroupKey(chat as any, myIdRef.current));
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
            if (activeChatIdRef.current === chatId) {
              const newId = data.message?.id ?? Date.now();
              const ts = data.message?.timestamp as string | undefined;
              const newMsg = {
                id: newId,
                content: content ?? null,
                content_type: data.message?.content_type,
                sender: data.message?.sender,
                timestamp: ts,
                attachment: data.message?.attachment ?? null,
              } as const;
              setMessages((prev) => [...prev, newMsg as any]);
              try {
                queryClient.setQueryData(
                  ["messages", token, chatId],
                  (prev: any[] | undefined) => [
                    ...((prev as any[]) ?? []),
                    newMsg,
                  ]
                );
              } catch {}
              try {
                await setReadState(token, chatId, newId);

                // Update unread count to 0 for active chat
                setUnreadMap((prev) => ({
                  ...prev,
                  [chatId]: 0,
                }));
              } catch {}
            } else {
              // Update cache for that chat so it shows immediately on switch
              try {
                const newMsg = {
                  id: data.message?.id ?? Date.now(),
                  content: content ?? null,
                  content_type: data.message?.content_type,
                  sender: data.message?.sender,
                  timestamp: data.message?.timestamp as string | undefined,
                  attachment: data.message?.attachment ?? null,
                } as const;
                queryClient.setQueryData(
                  ["messages", token, chatId],
                  (prev: any[] | undefined) => [
                    ...((prev as any[]) ?? []),
                    newMsg,
                  ]
                );
              } catch {}
              handlersRef.current.onNewMessage?.(chatId);
            }
            return;
          }
        } catch {}
      };
      ws.onerror = (err) => {
        try {
          console.warn("WS: error", { error: err, url: wsUrl });
        } catch {}
      };
      ws.onclose = (evt) => {
        try {
          console.info("WS: close", {
            code: (evt as any)?.code,
            reason: (evt as any)?.reason,
          });
        } catch {}
        wsRef.current = null;
      };
    } catch {}
    return () => {
      try {
        try {
          console.info("WS: closing");
        } catch {}
        try {
          socket?.close();
        } catch {}
      } catch {}
    };
  }, [wsUrl]);

  // Subscribe/unsubscribe on active chat change
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Queue messages to ensure server gets desired subscription once open
      const prev = prevSubRef.current;
      try {
        if (prev && prev !== activeChatId) {
          sendQueueRef.current.push(
            JSON.stringify({ v: 1, type: "unsubscribe", chat_id: prev })
          );
          try {
            console.info("WS: queue unsubscribe (not open)", { chatId: prev });
          } catch {}
        }
        if (activeChatId) {
          sendQueueRef.current.push(
            JSON.stringify({ v: 1, type: "subscribe", chat_id: activeChatId })
          );
          try {
            console.info("WS: queue subscribe (not open)", {
              chatId: activeChatId,
            });
          } catch {}
        }
      } catch {}
      prevSubRef.current = activeChatId;
      return;
    }
    const prev = prevSubRef.current;
    if (prev && prev !== activeChatId) {
      try {
        ws.send(JSON.stringify({ v: 1, type: "unsubscribe", chat_id: prev }));
        try {
          console.info("WS: unsubscribe", { chatId: prev });
        } catch {}
      } catch {}
    }
    if (activeChatId) {
      try {
        ws.send(
          JSON.stringify({ v: 1, type: "subscribe", chat_id: activeChatId })
        );
        try {
          console.info("WS: subscribe", { chatId: activeChatId });
        } catch {}
      } catch {}
      setUnreadMap((prev) => ({ ...prev, [activeChatId]: 0 }));
    }
    prevSubRef.current = activeChatId;
  }, [activeChatId, setUnreadMap, queryClient, token]);

  // Sync unread counts with server periodically to prevent drift
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      try {
        // Only sync if we have unread counts and they're not 0
        const currentUnreadCounts = queryClient.getQueryData([
          "unreadCounts",
          token,
        ]) as Record<number, number> | undefined;

        if (currentUnreadCounts) {
          const hasUnread = Object.values(currentUnreadCounts).some(
            (count) => count > 0
          );
          if (hasUnread) {
            // Invalidate unread counts to fetch fresh data from server
            queryClient.invalidateQueries({
              queryKey: ["unreadCounts", token],
            });
          }
        }
      } catch {
        // Ignore errors in background sync
      }
    }, 30000); // Sync every 30 seconds

    return () => clearInterval(syncInterval);
  }, [queryClient, token]);

  // Load history when activeChatId changes
  useEffect(() => {
    (async () => {
      if (!activeChatId) return;
      try {
        const cached = queryClient.getQueryData([
          "messages",
          token,
          activeChatId,
        ]) as any[] | undefined;
        if (cached && cached.length) setMessages(cached as any);
        else setMessages([]);
      } catch {
        setMessages([]);
      }
      setMessagesLoading(true);
      try {
        const history = await getChatMessages(token, activeChatId);
        let items = history as any[];
        const chat = chatsRef.current.find((c) => c.id === activeChatId);
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
                const keyRec = await getPublicKey(token, (other as any).id);
                const shared = await getSharedKeyWithUser(
                  (other as any).id,
                  JSON.parse(keyRec.public_key_jwk as string)
                );
                items = await Promise.all(
                  history.map(async (m) =>
                    m.ciphertext && m.nonce
                      ? (async () => {
                          try {
                            const text = await decryptTextAesGcm(
                              m.ciphertext as string,
                              m.nonce as string,
                              shared
                            );
                            return { ...m, content: text };
                          } catch {
                            return m as any;
                          }
                        })()
                      : (m as any)
                  )
                );
              } catch {}
            }
          } else if (chat.chat_type === "group") {
            const key = await ensureGroupKey(chat as any, myId);
            if (key) {
              items = await Promise.all(
                history.map(async (m) =>
                  m.ciphertext && m.nonce
                    ? (async () => {
                        try {
                          const text = await decryptTextAesGcm(
                            m.ciphertext as string,
                            m.nonce as string,
                            key
                          );
                          return { ...m, content: text };
                        } catch {
                          return m as any;
                        }
                      })()
                    : (m as any)
                )
              );
            }
          }
        }
        const mapped = items.map((m: any) => ({
          id: m.id,
          content: m.content as any,
          content_type: m.content_type as any,
          sender: m.sender,
          timestamp: m.timestamp as string,
          attachment: m.attachment ?? null,
        }));
        setMessages(mapped);
        try {
          queryClient.setQueryData(
            ["messages", token, activeChatId],
            mapped as any
          );
        } catch {}
        try {
          const lastId = history.length ? history[history.length - 1].id : null;
          if (lastId != null) {
            const updated = await setReadState(token, activeChatId, lastId);
            setBaselineReadId(updated.last_read_message_id);
            setShowUnreadDivider(false);

            // Update unread count to 0 for active chat
            setUnreadMap((prev) => ({
              ...prev,
              [activeChatId]: 0,
            }));
          }
        } catch {}
      } finally {
        setMessagesLoading(false);
      }
    })();
  }, [activeChatId, token, myId, ensureGroupKey, queryClient]);

  const sendText = useCallback(
    async (text: string) => {
      if (!activeChatId || !text.trim()) return;
      try {
        let payload: any = {
          v: 1,
          type: "send_message",
          chat_id: activeChatId,
          content: text,
          content_type: "text" as const,
        };
        const chat = chatsRef.current.find((c) => c.id === activeChatId);
        if (
          chat &&
          (chat.chat_type === "private" || chat.chat_type === "group")
        ) {
          try {
            if (chat.chat_type === "private") {
              const other =
                chat.participants.find((p) => p.id !== myId) ||
                (myId != null ? ({ id: myId } as any) : null);
              if (other) {
                const keyRec = await getPublicKey(token, (other as any).id);
                const shared = await getSharedKeyWithUser(
                  (other as any).id,
                  JSON.parse(keyRec.public_key_jwk)
                );
                const enc = await encryptTextAesGcm(text, shared);
                payload = {
                  v: 1,
                  type: "send_message",
                  chat_id: activeChatId,
                  content: null,
                  content_type: "text",
                  ciphertext: enc.ciphertextB64,
                  nonce: enc.nonceB64,
                  algo: enc.algo,
                };
              }
            } else if (chat.chat_type === "group") {
              const key =
                groupKeyRef.current ||
                (await ensureGroupKey(chat as any, myId));
              if (!key) throw new Error("Group key not available");
              const enc = await encryptTextAesGcm(text, key);
              payload = {
                v: 1,
                type: "send_message",
                chat_id: activeChatId,
                content: null,
                content_type: "text",
                ciphertext: enc.ciphertextB64,
                nonce: enc.nonceB64,
                algo: enc.algo,
              };
            }
          } catch (e) {
            try {
              console.warn("WS: encryption failed, sending plaintext", e);
            } catch {}
            // fallback to plaintext payload already defined
          }
        }
        const ws = wsRef.current;
        if (!ws) throw new Error("WS not available");
        const serialized = JSON.stringify(payload);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(serialized);
        } else if (ws.readyState === WebSocket.CONNECTING) {
          try {
            console.info("WS: queue send_message (connecting)", {
              chatId: activeChatId,
            });
          } catch {}
          sendQueueRef.current.push(serialized);
        } else {
          throw new Error("WS not open");
        }
        try {
          console.info("WS: send_message", {
            chatId: activeChatId,
            encrypted: payload.content == null,
          });
        } catch {}
      } catch {}
    },
    [activeChatId, myId, token, ensureGroupKey]
  );

  const onSendAttachment = useCallback(
    async (file: File) => {
      if (!activeChatId) return;
      const chat = chats.find((c) => c.id === activeChatId);
      if (!chat) return;
      let key: CryptoKey | null = null;
      if (chat.chat_type === "private") {
        const other =
          chat.participants.find((p) => p.id !== myId) ||
          (myId != null ? ({ id: myId } as any) : null);
        if (other) {
          const keyRec = await getPublicKey(token, (other as any).id);
          key = await getSharedKeyWithUser(
            (other as any).id,
            JSON.parse(keyRec.public_key_jwk)
          );
        }
      } else if (chat.chat_type === "group") {
        key = (await (loadGroupKey(chat.id) ||
          ensureGroupKey(chat as any, myId))) as any;
        if (!(key instanceof CryptoKey))
          key = await ensureGroupKey(chat as any, myId);
      }
      if (!key) throw new Error("Missing encryption key");
      const buf = new Uint8Array(await file.arrayBuffer());
      const enc = await encryptBytesAesGcm(buf, key);
      const att = await uploadEncryptedFile(
        token,
        Uint8Array.from(atob(enc.ciphertextB64), (c) => c.charCodeAt(0)),
        file.name,
        file.type || "application/octet-stream",
        enc.nonceB64
      );
      let ctype: "image" | "video" | "file" = "file";
      if ((file.type || "").startsWith("image/")) ctype = "image";
      else if ((file.type || "").startsWith("video/")) ctype = "video";
      // Send WS message with attachment_id so the chat updates in real-time
      const ws = wsRef.current;
      if (!ws) throw new Error("WS not available");
      const payload = {
        v: 1,
        type: "send_message" as const,
        chat_id: activeChatId,
        content: null as any,
        content_type: ctype,
        attachment_id: att.id,
      };
      const serialized = JSON.stringify(payload);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      } else if (ws.readyState === WebSocket.CONNECTING) {
        try {
          console.info("WS: queue send_message (attachment, connecting)", {
            chatId: activeChatId,
          });
        } catch {}
        sendQueueRef.current.push(serialized);
      } else {
        throw new Error("WS not open");
      }
      try {
        console.info("WS: send_message (attachment)", {
          chatId: activeChatId,
          attachmentId: att.id,
          contentType: ctype,
        });
      } catch {}
    },
    [activeChatId, myId, token, ensureGroupKey, chats]
  );

  const onDropFiles = useCallback(
    async (files: FileList) => {
      const f = files[0];
      if (!f) return;
      await onSendAttachment(f);
    },
    [onSendAttachment]
  );

  const firstUnreadIndex = useMemo(() => {
    if (!showUnreadDivider) return -1;
    if (baselineReadId == null) return -1;
    return messages.findIndex((m) => m.id > baselineReadId);
  }, [messages, baselineReadId, showUnreadDivider]);

  const appendSystemNotice = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), content: text, timestamp: new Date().toISOString() },
    ]);
  }, []);

  return {
    messages,
    messagesLoading,
    sendText,
    onSendAttachment,
    onDropFiles,
    firstUnreadIndex,
    appendSystemNotice,
  };
}
