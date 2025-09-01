import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCcw, LogOut, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MdOutlineGroupAdd } from "react-icons/md";
import { toast } from "sonner";
import { ChatItem } from "./ChatItem";
import type { ChatParticipant } from "@/types/chat";

type Chat = {
  id: number;
  chat_type: string;
  participants: ChatParticipant[];
  title?: string;
  name?: string | null;
  admin_user_id?: number | null;
  is_pinned: boolean;
};

export function ChatSidebar({
  chats,
  approvedUsers,
  activeChatId,
  setActiveChatId,
  filterTab,
  setFilterTab,
  search,
  setSearch,
  unreadMap,
  lastIncomingAt,
  onlineIds,
  loading,
  refreshing,
  onRefresh,
  onOpenCreateGroup,
  myId,
  token,
  loadChats,
  createPrivateChat,
  onLogout,
  invalidateChatsCache,
  pinnedChatIds,
  maxPinnedChats,
  pinChat,
  unpinChat,
}: {
  chats: Chat[];
  approvedUsers: Array<{
    user_id: number;
    username: string;
    chat_id?: number | null;
    is_self: boolean;
  }>;
  activeChatId: number | null;
  setActiveChatId: (id: number) => void;
  filterTab: "all" | "groups";
  setFilterTab: (tab: "all" | "groups") => void;
  search: string;
  setSearch: (s: string) => void;
  unreadMap: Record<number, number>;
  lastIncomingAt: Record<number, number>;
  onlineIds: Set<number>;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<void> | void;
  onOpenCreateGroup: () => void;
  myId: number | null;
  token: string;
  loadChats: () => Promise<void>;
  createPrivateChat: (token: string, userId: number) => Promise<{ id: number }>;
  onLogout: () => void;
  invalidateChatsCache: () => void;
  pinnedChatIds: number[];
  maxPinnedChats: number;
  pinChat: (chatId: number) => Promise<boolean>;
  unpinChat: (chatId: number) => Promise<void>;
}) {
  const navigate = useNavigate();

  return (
    <aside className="border-l p-4 space-y-3 min-h-0 overflow-y-auto flex flex-col">
      <Card className="shrink-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>צ'אטים</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRefresh()}
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
              onClick={onOpenCreateGroup}
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
            {loading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={`skeleton-${i}`}>
                    <div className="w-full h-10 rounded bg-muted animate-pulse" />
                  </li>
                ))}
              </>
            )}
            {!loading &&
              chats
                .filter((chat) => {
                  // Apply filter tab
                  if (filterTab === "groups" && chat.chat_type !== "group") {
                    return false;
                  }

                  // Apply search filter
                  if (search.trim()) {
                    const q = search.trim().toLowerCase();
                    if (chat.chat_type === "group") {
                      return (
                        chat.title?.toLowerCase().includes(q) ||
                        chat.name?.toLowerCase().includes(q) ||
                        `קבוצה #${chat.id}`.toLowerCase().includes(q)
                      );
                    } else {
                      // For private chats, search in participant names
                      const participant = chat.participants.find(
                        (p) => p.id !== myId
                      );
                      if (participant) {
                        const fullName = [
                          participant.first_name,
                          participant.last_name,
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          fullName.toLowerCase().includes(q) ||
                          participant.username.toLowerCase().includes(q)
                        );
                      }
                    }
                    return false;
                  }

                  return true;
                })
                .map((chat) => {
                  // Find the other user for private chats
                  let otherUserId: number | undefined;
                  if (chat.chat_type === "private" && myId) {
                    const otherParticipant = chat.participants.find(
                      (p) => p.id !== myId
                    );
                    otherUserId = otherParticipant?.id;
                  }

                  return (
                    <li key={`chat-${chat.id}`}>
                      <ChatItem
                        chat={chat}
                        isActive={activeChatId === chat.id}
                        unreadCount={unreadMap[chat.id]}
                        isOnline={
                          otherUserId ? onlineIds.has(otherUserId) : false
                        }
                        onSelect={() => setActiveChatId(chat.id)}
                        onPin={async () => {
                          const success = await pinChat(chat.id);
                          if (!success) {
                            toast.error(
                              `הגעת למקסימום צ'אטים מועדפים (${maxPinnedChats}). בטל נעיצה מצ'אט אחר כדי להוסיף חדש.`
                            );
                          }
                        }}
                        onUnpin={async () => await unpinChat(chat.id)}
                        isPinned={pinnedChatIds.includes(chat.id)}
                        canPin={!pinnedChatIds.includes(chat.id)}
                        maxPinnedChats={maxPinnedChats}
                        currentPinnedCount={pinnedChatIds.length}
                      />
                    </li>
                  );
                })}

            {/* Show approved users without existing chats */}
            {!loading &&
              approvedUsers
                .filter((user) => !user.chat_id)
                .filter((user) => {
                  // Apply search filter
                  if (search.trim()) {
                    const q = search.trim().toLowerCase();
                    if (user.is_self) {
                      return "צ'אט עם עצמי".toLowerCase().includes(q);
                    } else {
                      return user.username.toLowerCase().includes(q);
                    }
                  }
                  return true;
                })
                .map((user) => (
                  <li key={`user-${user.user_id}`}>
                    <Button
                      variant="ghost"
                      className="flex-1 justify-between w-full"
                      onClick={async () => {
                        invalidateChatsCache();
                        const chat = await createPrivateChat(
                          token,
                          user.user_id
                        );
                        setActiveChatId(chat.id);
                        await loadChats();
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <span
                          className={`ml-2 inline-block h-2 w-2 rounded-full ${
                            onlineIds.has(user.user_id)
                              ? "bg-emerald-500"
                              : "bg-gray-300"
                          }`}
                        />
                        {user.is_self ? "צ'אט עם עצמי" : user.username}
                      </span>
                    </Button>
                  </li>
                ))}
          </ul>
        </CardContent>
      </Card>
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {/* <ThemeToggle /> */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="הגדרות"
            onClick={() => navigate("/settings")}
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onLogout}
          aria-label="יציאה"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </aside>
  );
}
