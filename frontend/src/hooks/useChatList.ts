import { useCallback, useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getApprovedPeers,
  getChats,
  getUnreadCounts,
  pinChat as apiPinChat,
  unpinChat as apiUnpinChat,
  getUserSettings,
} from "@/api";

type ChatRec = {
  id: number;
  chat_type: string;
  participants: { id: number; username: string }[];
  title?: string;
  name?: string | null;
  admin_user_id?: number | null;
  is_pinned: boolean;
};

// Maximum number of chats that can be pinned
const MAX_PINNED_CHATS = 3;

export function useChatList(token: string) {
  const queryClient = useQueryClient();

  const chatsQuery = useQuery({
    queryKey: ["chats", token],
    queryFn: () => getChats(token) as Promise<ChatRec[]>,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const approvedUsersQuery = useQuery({
    queryKey: ["approvedPeers", token],
    queryFn: () => getApprovedPeers(token),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const unreadCountsQuery = useQuery({
    queryKey: ["unreadCounts", token],
    queryFn: async () => {
      const counts = await getUnreadCounts(token);
      const map: Record<number, number> = {};
      for (const r of counts) map[r.chat_id] = r.unread_count;
      return map;
    },
    staleTime: 15_000,
    gcTime: 2 * 60_000,
  });

  const userSettingsQuery = useQuery({
    queryKey: ["userSettings", token],
    queryFn: async () => {
      const settings = await getUserSettings(token);
      return settings;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const chats = chatsQuery.data ?? [];
  const approvedUsers = approvedUsersQuery.data ?? [];
  const unreadMap = unreadCountsQuery.data ?? {};
  const userSettings = userSettingsQuery.data;

  // Get max pinned chats from user settings
  const maxPinnedChats = userSettings?.pinned_chats_limit ?? 3;

  // Extract pinned chat IDs from chats data
  const pinnedChatIdsFromAPI = chats
    .filter((chat) => chat.is_pinned)
    .map((chat) => chat.id);

  const loading =
    chatsQuery.isLoading ||
    approvedUsersQuery.isLoading ||
    unreadCountsQuery.isLoading ||
    userSettingsQuery.isLoading;

  const setUnreadMap = useCallback(
    (updater: (prev: Record<number, number>) => Record<number, number>) => {
      const prev = unreadCountsQuery.data ?? {};
      const next = updater(prev);
      queryClient.setQueryData(["unreadCounts", token], next);
    },
    [queryClient, token, unreadCountsQuery.data]
  );

  const loadChats = useCallback(async () => {
    return queryClient.invalidateQueries({ queryKey: ["chats", token] });
  }, [queryClient, token]);

  const refreshLists = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["chats", token] }),
      queryClient.invalidateQueries({ queryKey: ["approvedPeers", token] }),
      queryClient.invalidateQueries({ queryKey: ["unreadCounts", token] }),
    ]);
  }, [queryClient, token]);

  const invalidateChatsCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["chats", token] });
  }, [queryClient, token]);

  // Pin/unpin chat functions
  const pinChat = useCallback(
    async (chatId: number) => {
      if (pinnedChatIdsFromAPI.length >= maxPinnedChats) return false; // Max pinned chats
      if (pinnedChatIdsFromAPI.includes(chatId)) return false; // Already pinned

      try {
        await apiPinChat(token, chatId);
        // Invalidate chats cache to refresh data
        queryClient.invalidateQueries({ queryKey: ["chats", token] });
        return true;
      } catch (error) {
        console.error("Failed to pin chat:", error);
        return false;
      }
    },
    [pinnedChatIdsFromAPI, maxPinnedChats, token, queryClient]
  );

  const unpinChat = useCallback(
    async (chatId: number) => {
      try {
        await apiUnpinChat(token, chatId);
        // Invalidate chats cache to refresh data
        queryClient.invalidateQueries({ queryKey: ["chats", token] });
      } catch (error) {
        console.error("Failed to unpin chat:", error);
      }
    },
    [token, queryClient]
  );

  // Sort chats: pinned first, then by last activity
  const sortedChats = useMemo(() => {
    if (chats.length === 0) return [];

    const pinned = chats.filter((chat) =>
      pinnedChatIdsFromAPI.includes(chat.id)
    );
    const unpinned = chats.filter(
      (chat) => !pinnedChatIdsFromAPI.includes(chat.id)
    );

    // Sort unpinned by last activity (you can customize this sorting)
    const sortedUnpinned = [...unpinned].sort((a, b) => {
      // For now, just keep original order
      return 0;
    });

    return [...pinned, ...sortedUnpinned];
  }, [chats, pinnedChatIdsFromAPI]);

  return {
    chats: sortedChats,
    approvedUsers,
    unreadMap,
    setUnreadMap,
    loadChats,
    refreshLists,
    loading,
    invalidateChatsCache,
    pinnedChatIds: pinnedChatIdsFromAPI,
    maxPinnedChats,
    pinChat,
    unpinChat,
  } as const;
}
