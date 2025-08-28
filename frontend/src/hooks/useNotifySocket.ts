import { useCallback, useEffect, useRef } from "react";
import { buildNotifyWsUrl, publishPublicKey } from "@/api";
import { getStoredPublicJwk } from "@/lib/e2ee";

type NotifyHandlers = {
  onUnreadUpdate?: (chatId: number) => void;
  onRemovedFromChat?: (chatId: number) => void;
  onUsersChanged?: () => void;
  onChatsChanged?: () => void;
  onNewMessage?: (chatId: number) => void;
  activeChatIdRef: React.MutableRefObject<number | null>;
};

export function useNotifySocket(token: string, handlers: NotifyHandlers) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<NotifyHandlers>(handlers);

  // Keep latest handlers without changing open/close behavior
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const openSocket = useCallback(() => {
    try {
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      )
        return;
      const nws = new WebSocket(buildNotifyWsUrl(token));
      wsRef.current = nws;
      nws.onmessage = async (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data?.type === "unread_update") {
            handlersRef.current.onUnreadUpdate?.(data.chat_id);
          } else if (data?.type === "removed_from_chat") {
            handlersRef.current.onRemovedFromChat?.(data.chat_id);
          } else if (data?.type === "new_message") {
            const curr = handlersRef.current.activeChatIdRef.current;
            if (!curr || curr !== data.chat_id) handlersRef.current.onNewMessage?.(data.chat_id);
          } else if (data?.type === "users_changed") {
            handlersRef.current.onUsersChanged?.();
            try {
              const pub = await getStoredPublicJwk();
              if (pub) await publishPublicKey(token, JSON.stringify(pub));
            } catch {}
          } else if (data?.type === "chats_changed") {
            handlersRef.current.onChatsChanged?.();
          }
        } catch {}
      };
      nws.onclose = () => {};
      nws.onerror = () => {
        try {
          nws.close();
        } catch {}
      };
    } catch {}
  }, [token]);

  useEffect(() => {
    openSocket();
    return () => {
      try {
        wsRef.current?.close();
      } catch {}
    };
  }, [openSocket]);
}


