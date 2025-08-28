import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCcw, LogOut, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useNavigate } from "react-router-dom";
import { MdOutlineGroupAdd } from "react-icons/md";

type ChatParticipant = { id: number; username: string };

type Chat = {
  id: number;
  chat_type: string;
  participants: ChatParticipant[];
  title?: string;
  name?: string | null;
  admin_user_id?: number | null;
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
  onlineIds,
  refreshing,
  onRefresh,
  onOpenCreateGroup,
  myId,
  token,
  loadChats,
  createPrivateChat,
  onLogout,
}: {
  chats: Chat[];
  approvedUsers: Array<{ user_id: number; username: string; chat_id?: number | null; is_self: boolean }>;
  activeChatId: number | null;
  setActiveChatId: (id: number) => void;
  filterTab: "all" | "groups";
  setFilterTab: (tab: "all" | "groups") => void;
  search: string;
  setSearch: (s: string) => void;
  unreadMap: Record<number, number>;
  onlineIds: Set<number>;
  refreshing: boolean;
  onRefresh: () => Promise<void> | void;
  onOpenCreateGroup: () => void;
  myId: number | null;
  token: string;
  loadChats: () => Promise<void>;
  createPrivateChat: (token: string, userId: number) => Promise<{ id: number }>;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const unifiedItems = useMemo(() => {
    const groups = (chats as any[])
      .filter((c) => c.chat_type === "group")
      .map((c) => ({ kind: "group" as const, chatId: c.id, displayName: (c as any).title || `קבוצה #${c.id}` }));
    const privates = approvedUsers.map((u) => ({ kind: "private" as const, userId: u.user_id, displayName: u.is_self ? "צ'אט עם עצמי" : u.username, chatId: u.chat_id ?? undefined }));
    let items = filterTab === "groups" ? groups : [...privates, ...groups];
    const q = search.trim().toLowerCase();
    if (q) items = items.filter((it) => it.displayName.toLowerCase().includes(q));
    return items;
  }, [approvedUsers, chats, filterTab, search, myId]);

  return (
    <aside className="border-l p-4 space-y-3 min-h-0 overflow-y-auto flex flex-col">
      <Card className="shrink-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>צ'אטים</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => onRefresh()} aria-label="רענן" disabled={refreshing}>
              <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onOpenCreateGroup} aria-label="צור קבוצה">
              <MdOutlineGroupAdd className={`h-4 w-4`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 space-y-2">
          <div className="flex gap-2 items-center">
            <Button variant={filterTab === "all" ? "default" : "ghost"} onClick={() => setFilterTab("all")}>
              הכל
            </Button>
            <Button variant={filterTab === "groups" ? "default" : "ghost"} onClick={() => setFilterTab("groups")}>
              קבוצות
            </Button>
          </div>
          <Input placeholder="חיפוש לפי שם משתמש או שם צ'אט" value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="space-y-1">
            {unifiedItems.map((it) => {
              const key = (it as any).kind === "group" ? `group-${(it as any).chatId}` : `private-${(it as any).userId}-${(it as any).chatId ?? "new"}`;
              return (
                <li key={key}>
                  <Button
                    variant={"chatId" in it && (it as any).chatId && activeChatId === (it as any).chatId ? "default" : "ghost"}
                    className="w-full justify-between"
                    onClick={async () => {
                      if ((it as any).kind === "group") {
                        setActiveChatId((it as any).chatId);
                      } else {
                        const existing = (it as any).chatId;
                        if (existing) {
                          setActiveChatId(existing);
                        } else {
                          const chat = await createPrivateChat(token, (it as any).userId);
                          setActiveChatId(chat.id);
                          await loadChats();
                        }
                      }
                    }}
                  >
                    <span className="inline-flex items-center">
                      {(it as any).kind === "private" && (
                        <span className={`ml-2 inline-block h-2 w-2 rounded-full ${onlineIds.has((it as any).userId) ? "bg-emerald-500" : "bg-gray-300"}`} />
                      )}
                      {it.displayName}
                      {(it as any).kind === "group" ? " · קבוצה" : ""}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {"chatId" in it && (it as any).chatId && unreadMap[(it as any).chatId] ? unreadMap[(it as any).chatId] : ""}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {/* <ThemeToggle /> */}
          <Button variant="ghost" size="icon" aria-label="הגדרות" onClick={() => navigate("/settings") }>
            <Settings className="h-5 w-5" />
          </Button>
        </div>
        <Button variant="ghost" size="icon" onClick={onLogout} aria-label="יציאה">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </aside>
  );
}


