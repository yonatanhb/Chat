import { Button } from "@/components/ui/button";
import type { ChatParticipant } from "@/types/chat";

type ChatItemProps = {
  chat: {
    id: number;
    chat_type: string;
    participants: ChatParticipant[];
    title?: string;
    name?: string | null;
    admin_user_id?: number | null;
    is_pinned: boolean;
  };
  isActive: boolean;
  unreadCount?: number;
  isOnline?: boolean;
  onSelect: () => void;
  onPin: () => void;
  onUnpin: () => void;
  isPinned: boolean;
  canPin: boolean;
  maxPinnedChats: number;
  currentPinnedCount: number;
};

export function ChatItem({
  chat,
  isActive,
  unreadCount,
  isOnline,
  onSelect,
  onPin,
  onUnpin,
  isPinned,
  canPin,
  maxPinnedChats,
  currentPinnedCount,
}: ChatItemProps) {
  const getDisplayName = () => {
    if (chat.chat_type === "group") {
      return chat.title || `קבוצה #${chat.id}`;
    } else {
      // For private chats, show first_name + last_name if available
      const otherParticipant = chat.participants[0]; // Assuming 2 participants for private chat
      if (otherParticipant.first_name && otherParticipant.last_name) {
        return `${otherParticipant.first_name} ${otherParticipant.last_name}`;
      } else if (otherParticipant.first_name) {
        return otherParticipant.first_name;
      } else {
        return otherParticipant.username;
      }
    }
  };

  const getTypeLabel = () => {
    return chat.chat_type === "group" ? " · קבוצה" : "";
  };

  return (
    <div className="group flex items-center gap-1">
      <Button
        variant={isActive ? "default" : "ghost"}
        className="flex-1 justify-between"
        onClick={onSelect}
      >
        <span className="inline-flex items-center gap-1">
          {chat.chat_type === "private" && (
            <span
              className={`ml-2 inline-block h-2 w-2 rounded-full ${
                isOnline ? "bg-emerald-500" : "bg-gray-300"
              }`}
            />
          )}
          {getDisplayName()}
          {getTypeLabel()}
        </span>
        <span className="ml-2 text-xs text-muted-foreground">
          {unreadCount || ""}
        </span>
      </Button>

      {/* Pin/Unpin button */}
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 shrink-0 transition-opacity duration-200 ${
          isPinned
            ? "opacity-100" // Always visible if pinned
            : "opacity-0 group-hover:opacity-100" // Only on hover if not pinned
        }`}
        onClick={isPinned ? onUnpin : onPin}
        title={
          isPinned
            ? "בטל נעיצה"
            : `נעוץ צ'אט (${maxPinnedChats - currentPinnedCount} נותרו)`
        }
      >
        <span
          className={`text-sm ${
            isPinned ? "text-blue-500" : "text-muted-foreground"
          }`}
        >
          📌
        </span>
      </Button>
    </div>
  );
}
