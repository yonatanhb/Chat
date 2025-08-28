import { useCallback, useState } from "react";
import { getApprovedPeers, getChats, getUnreadCounts } from "@/api";

export function useChatList(token: string) {
  const [chats, setChats] = useState<Array<{
    id: number;
    chat_type: string;
    participants: { id: number; username: string }[];
    title?: string;
    name?: string | null;
    admin_user_id?: number | null;
  }>>([]);
  const [approvedUsers, setApprovedUsers] = useState<
    Array<{ user_id: number; username: string; chat_id?: number | null; is_self: boolean }>
  >([]);
  const [unreadMap, setUnreadMap] = useState<Record<number, number>>({});

  const loadChats = useCallback(async () => {
    const data = await getChats(token);
    setChats(data as any);
    return data as any;
  }, [token]);

  const refreshLists = useCallback(async () => {
    try {
      await loadChats();
      const peers = await getApprovedPeers(token);
      setApprovedUsers(peers);
      const counts = await getUnreadCounts(token);
      const map: Record<number, number> = {};
      for (const r of counts) map[r.chat_id] = r.unread_count;
      setUnreadMap(map);
    } catch {}
  }, [loadChats, token]);

  return { chats, approvedUsers, unreadMap, setUnreadMap, loadChats, refreshLists };
}


