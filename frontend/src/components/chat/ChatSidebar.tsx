import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCcw, LogOut, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MdOutlineGroupAdd } from "react-icons/md";
import { toast } from "sonner";

type ChatParticipant = { id: number; username: string };

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
  const unifiedItems = useMemo(() => {
    // Simple approach: convert sorted chats directly to display format
    const chatItems: Array<{
      kind: "group" | "private";
      chatId?: number;
      displayName: string;
      userId?: number;
    }> = [];

    // First, add all chats in their sorted order (pinned first)
    chats.forEach((chat) => {
      chatItems.push({
        kind: chat.chat_type as "group" | "private",
        chatId: chat.id,
        displayName:
          chat.title ||
          (chat.chat_type === "group"
            ? `קבוצה #${chat.id}`
            : `צ'אט פרטי #${chat.id}`),
      });
    });

    // Then add approved users that don't have existing chats
    approvedUsers.forEach((user) => {
      if (!user.chat_id) {
        chatItems.push({
          kind: "private",
          userId: user.user_id,
          displayName: user.is_self ? "צ'אט עם עצמי" : user.username,
          chatId: undefined,
        });
      }
    });

    let items =
      filterTab === "groups"
        ? chatItems.filter((item) => item.kind === "group")
        : chatItems;

    // Apply search filter
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter((it) => it.displayName.toLowerCase().includes(q));
    }

    return items;
  }, [chats, approvedUsers, filterTab, search]);

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
              unifiedItems.map((it) => {
                const key =
                  (it as any).kind === "group"
                    ? `group-${(it as any).chatId}`
                    : `private-${(it as any).userId}-${
                        (it as any).chatId ?? "new"
                      }`;
                return (
                  <li key={key}>
                    <div className="group flex items-center gap-1">
                      <Button
                        variant={
                          "chatId" in it &&
                          (it as any).chatId &&
                          activeChatId === (it as any).chatId
                            ? "default"
                            : "ghost"
                        }
                        className="flex-1 justify-between"
                        onClick={async () => {
                          if ((it as any).kind === "group") {
                            setActiveChatId((it as any).chatId);
                          } else {
                            const existing = (it as any).chatId;
                            if (existing) {
                              setActiveChatId(existing);
                            } else {
                              invalidateChatsCache();
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
                        <span className="inline-flex items-center gap-1">
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

                      {/* Pin/Unpin button - show on hover or always if pinned */}
                      {(it as any).chatId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 shrink-0 transition-opacity duration-200 ${
                            pinnedChatIds.includes((it as any).chatId)
                              ? "opacity-100" // Always visible if pinned
                              : "opacity-0 group-hover:opacity-100" // Only on hover if not pinned
                          }`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const chatId = (it as any).chatId;
                            if (pinnedChatIds.includes(chatId)) {
                              await unpinChat(chatId);
                            } else {
                              const success = await pinChat(chatId);
                              if (!success) {
                                toast.error(
                                  `הגעת למקסימום צ'אטים מועדפים (${maxPinnedChats}). בטל נעיצה מצ'אט אחר כדי להוסיף חדש.`
                                );
                              }
                            }
                          }}
                          title={
                            pinnedChatIds.includes((it as any).chatId)
                              ? "בטל נעיצה"
                              : `נעוץ צ'אט (${
                                  maxPinnedChats - pinnedChatIds.length
                                } נותרו)`
                          }
                        >
                          <span
                            className={`text-sm ${
                              pinnedChatIds.includes((it as any).chatId)
                                ? "text-blue-500"
                                : "text-muted-foreground"
                            }`}
                          >
                            📌
                          </span>
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
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
