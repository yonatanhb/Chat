import { Fragment, useEffect, useMemo, useRef } from "react";
import { memo } from "react";
import { ChatMessage } from "./ChatMessage";
import { DaySeparator } from "./DaySeparator";
import { UnreadSeparator } from "./UnreadSeparator";
import { useDecryptedAttachment } from "@/hooks/useDecryptedAttachment";
import type { Attachment, Message } from "@/types/chat";

// moved to @/types/chat

type Props = {
  messages: Message[];
  firstUnreadIndex: number;
  myId?: number | null;
  isGroup?: boolean;
  token?: string;
  chatId?: number | null;
  otherUserId?: number | null;
};

export const ChatMessages = memo(function ChatMessages({
  messages,
  firstUnreadIndex,
  myId,
  isGroup,
  token,
  chatId,
  otherUserId,
}: Props) {
  const ChatMessageEx = ChatMessage as unknown as React.ComponentType<
    React.ComponentProps<typeof ChatMessage> & {
      onResolveAttachmentUrl?: (
        att: Attachment,
        senderId?: number
      ) => Promise<string>;
    }
  >;
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const { ensureDecryptedUrl } = useDecryptedAttachment({
    token,
    chatId,
    isGroup,
    otherUserId,
  });
  const formatTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return null;
    }
  }, []);
  const weekdayFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("he-IL", { weekday: "long" });
    } catch {
      return null;
    }
  }, []);
  const dateFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    anchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // code parsing/attachment decrypting delegated to components and hooks

  return (
    <div className="w-full max-w-full flex-1 overflow-y-auto space-y-2 pr-2 pl-2 box-border">
      {(() => {
        // Helpers for day grouping
        const startOfDay = (d: Date) => {
          const x = new Date(d);
          x.setHours(0, 0, 0, 0);
          return x;
        };
        const isSameDay = (a: Date, b: Date) =>
          a.getFullYear() === b.getFullYear() &&
          a.getMonth() === b.getMonth() &&
          a.getDate() === b.getDate();
        const labelFor = (date: Date): string => {
          const today = startOfDay(new Date());
          const d0 = startOfDay(date);
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          if (isSameDay(d0, today)) return "היום";
          if (isSameDay(d0, yesterday)) return "אתמול";
          const sevenAgo = new Date(today);
          sevenAgo.setDate(today.getDate() - 7);
          const weekday = weekdayFmt
            ? weekdayFmt.format(date)
            : date.toLocaleDateString("he-IL", { weekday: "long" } as any);
          if (d0 > sevenAgo) return weekday;
          const full = dateFmt
            ? dateFmt.format(date)
            : date.toLocaleDateString("he-IL");
          return `${weekday}, ${full}`;
        };
        let lastDayKey: string | null = null;
        return messages.map((m, idx) => {
          const isMine = myId != null && m.sender?.id === myId;
          const ts = m.timestamp ? new Date(m.timestamp) : null;
          const dayKey = ts
            ? `${ts.getFullYear()}-${ts.getMonth() + 1}-${ts.getDate()}`
            : `idx-${idx}`;
          const showDateLabel = ts != null && dayKey !== lastDayKey;
          if (showDateLabel) lastDayKey = dayKey;
          return (
            <Fragment key={m.id}>
              {showDateLabel && ts && <DaySeparator label={labelFor(ts)} />}
              {firstUnreadIndex === idx && <UnreadSeparator />}
              <ChatMessageEx
                message={m}
                isMine={isMine}
                isGroup={isGroup}
                formatTime={formatTime}
                onResolveAttachmentUrl={async (att: Attachment, senderId?: number) => {
                  return ensureDecryptedUrl(att, senderId);
                }}
                onDownloadAttachment={async (att: Attachment, senderId?: number) => {
                  try {
                    const url = await ensureDecryptedUrl(att, senderId);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = att.filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  } catch (e) {
                    console.error(e);
                    alert("נכשלה הורדת הקובץ. ודא שמפתח ההצפנה זמין.");
                  }
                }}
              />
            </Fragment>
          );
        });
      })()}
      <div ref={anchorRef} />
    </div>
  );
});
