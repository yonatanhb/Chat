import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  API_BASE,
  buildWsUrl,
  downloadAttachment,
  getChatMessages,
  getPublicKey,
  sendMessageWithAttachment,
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

export function useChatSocket({
  token,
  activeChatId,
  chats,
  myId,
  ensureGroupKey,
  groupKeyRef,
  setUnreadMap,
  setOnlineIds,
}: {
  token: string;
  activeChatId: number | null;
  chats: Chat[];
  myId: number | null;
  ensureGroupKey: (chat: Chat, myId: number | null) => Promise<CryptoKey | null>;
  groupKeyRef: React.MutableRefObject<CryptoKey | null>;
  setUnreadMap: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setOnlineIds: React.Dispatch<React.SetStateAction<Set<number>>>;
}) {
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
  const [showUnreadDivider, setShowUnreadDivider] = useState<boolean>(false);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Array<{ chatId: number; text: string }>>([]);

  const authHeader = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const chatsRef = useRef<Chat[]>(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    if (activeChatId == null) return;
    setUnreadMap((prev) => ({ ...prev, [activeChatId]: 0 }));
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const ws = new WebSocket(buildWsUrl(activeChatId, token));
    wsRef.current = ws;
    setMessages([]);
    setMessagesLoading(true);
    (async () => {
      try {
        const history = await getChatMessages(token, activeChatId);
        let items = history as any[];
        const chat = chatsRef.current.find((c) => c.id === activeChatId);
        if (chat && (chat.chat_type === "private" || chat.chat_type === "group")) {
          const other = chat.participants.find((p) => p.id !== myId) || (myId != null ? ({ id: myId } as any) : null);
          if (chat.chat_type === "private") {
            if (other) {
              try {
                const keyRec = await getPublicKey(token, (other as any).id);
                const shared = await getSharedKeyWithUser((other as any).id, JSON.parse(keyRec.public_key_jwk));
                items = await Promise.all(
                  history.map(async (m) => {
                    if (m.ciphertext && m.nonce) {
                      try {
                        const text = await decryptTextAesGcm(m.ciphertext, m.nonce, shared);
                        return { ...m, content: text };
                      } catch {
                        return m as any;
                      }
                    }
                    return m as any;
                  })
                );
              } catch {}
            }
          } else if (chat.chat_type === "group") {
            const key = await ensureGroupKey(chat as any, myId);
            if (key) {
              items = await Promise.all(
                history.map(async (m) => {
                  if (m.ciphertext && m.nonce) {
                    try {
                      const text = await decryptTextAesGcm(m.ciphertext, m.nonce, key);
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
          items.map((m: any) => ({
            id: m.id,
            content: m.content as any,
            content_type: m.content_type as any,
            sender: m.sender,
            timestamp: m.timestamp as string,
            attachment: m.attachment ?? null,
          }))
        );
        try {
          const rs = await fetch(`${API_BASE}/chats/${activeChatId}/read-state`, { headers: authHeader as any }).then((r) => r.json());
          setBaselineReadId(rs.last_read_message_id);
          const lastId = history.length ? history[history.length - 1].id : null;
          setShowUnreadDivider(!!(lastId != null && rs.last_read_message_id != null && lastId > rs.last_read_message_id));
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
      finally {
        setMessagesLoading(false);
      }
    })();
    ws.onopen = () => {
      const remain: Array<{ chatId: number; text: string }> = [];
      for (const msg of pendingRef.current) {
        if (msg.chatId === activeChatId) {
          try {
            ws.send(JSON.stringify({ content: msg.text, content_type: "text" }));
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
        if (data?.type === "presence_snapshot" && Array.isArray(data.online_user_ids)) {
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
          const chat = chatsRef.current.find((c) => c.id === activeChatId);
          let content = data.message?.content as string | null;
          if (!content && chat) {
            if (chat.chat_type === "private" && data.message?.ciphertext && data.message?.nonce) {
              const other = chat.participants.find((p) => p.id !== myId) || (myId != null ? ({ id: myId } as any) : null);
              if (other) {
                try {
                  const keyRec = await getPublicKey(token, (other as any).id);
                  const shared = await getSharedKeyWithUser((other as any).id, JSON.parse(keyRec.public_key_jwk));
                  content = await decryptTextAesGcm(data.message.ciphertext, data.message.nonce, shared);
                } catch {}
              }
            } else if (chat.chat_type === "group") {
              const key = groupKeyRef.current || (await ensureGroupKey(chat as any, myId));
              if (key && data.message?.ciphertext && data.message?.nonce) {
                try {
                  content = await decryptTextAesGcm(data.message.ciphertext, data.message.nonce, key);
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
          try {
            await setReadState(token, activeChatId, newId);
          } catch {}
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), content: String(evt.data), timestamp: new Date().toISOString() },
        ]);
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
    return () => ws.close();
  }, [activeChatId, token, myId, ensureGroupKey, setUnreadMap, authHeader]);

  const sendText = useCallback(
    async (text: string) => {
      if (!activeChatId || !text.trim()) return;
      try {
        let payload: any = { content: text, content_type: "text" as const };
        const chat = chatsRef.current.find((c) => c.id === activeChatId);
        if (chat && (chat.chat_type === "private" || chat.chat_type === "group")) {
          if (chat.chat_type === "private") {
            const other = chat.participants.find((p) => p.id !== myId) || (myId != null ? ({ id: myId } as any) : null);
            if (other) {
              const keyRec = await getPublicKey(token, (other as any).id);
              const shared = await getSharedKeyWithUser((other as any).id, JSON.parse(keyRec.public_key_jwk));
              const enc = await encryptTextAesGcm(text, shared);
              payload = { content: null, content_type: "text", ciphertext: enc.ciphertextB64, nonce: enc.nonceB64, algo: enc.algo };
            }
          } else if (chat.chat_type === "group") {
            const key = groupKeyRef.current || (await ensureGroupKey(chat as any, myId));
            if (!key) throw new Error("Group key not available");
            const enc = await encryptTextAesGcm(text, key);
            payload = { content: null, content_type: "text", ciphertext: enc.ciphertextB64, nonce: enc.nonceB64, algo: enc.algo };
          }
        }
        const saved = await fetch(`${API_BASE}/chats/${activeChatId}/messages`, {
          method: "POST",
          headers: { ...authHeader, "Content-Type": "application/json" } as any,
          body: JSON.stringify(payload),
        }).then((r) => r.json());
        try {
          await setReadState(token, activeChatId, saved.id);
          setBaselineReadId(saved.id);
          setShowUnreadDivider(false);
        } catch {}
      } catch {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ content: text, content_type: "text" }));
          } catch {}
        } else {
          pendingRef.current.push({ chatId: activeChatId!, text });
        }
      }
    },
    [activeChatId, myId, token, authHeader, ensureGroupKey]
  );

  const onSendAttachment = useCallback(
    async (file: File) => {
      if (!activeChatId) return;
      const chat = chats.find((c) => c.id === activeChatId);
      if (!chat) return;
      let key: CryptoKey | null = null;
      if (chat.chat_type === "private") {
        const other = chat.participants.find((p) => p.id !== myId) || (myId != null ? ({ id: myId } as any) : null);
        if (other) {
          const keyRec = await getPublicKey(token, (other as any).id);
          key = await getSharedKeyWithUser((other as any).id, JSON.parse(keyRec.public_key_jwk));
        }
      } else if (chat.chat_type === "group") {
        key = (await (loadGroupKey(chat.id) || ensureGroupKey(chat as any, myId))) as any;
        if (!(key instanceof CryptoKey)) key = await ensureGroupKey(chat as any, myId);
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
      await sendMessageWithAttachment(token, activeChatId, att.id, ctype);
    },
    [activeChatId, myId, token, ensureGroupKey]
  );

  const onDropFiles = useCallback(
    async (files: FileList) => {
      const f = files[0];
      if (!f) return;
      await onSendAttachment(f);
    },
    [onSendAttachment]
  );

  const appendSystemNotice = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), content: text, timestamp: new Date().toISOString() },
    ]);
  }, []);

  const firstUnreadIndex = useMemo(() => {
    if (!showUnreadDivider) return -1;
    if (baselineReadId == null) return -1;
    return messages.findIndex((m) => m.id > baselineReadId);
  }, [messages, baselineReadId, showUnreadDivider]);

  return { messages, messagesLoading, sendText, onSendAttachment, onDropFiles, firstUnreadIndex, appendSystemNotice };
}


