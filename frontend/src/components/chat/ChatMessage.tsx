import { memo, useEffect, useMemo, useState } from "react";
import { CodeBlockMessage } from "./CodeBlockMessage";
import { AttachmentMessage } from "./AttachmentMessage";
import type { Message, Attachment } from "@/types/chat";

type Theme = {
  mine?: { bg?: string; text?: string; meta?: string };
  theirs?: { bg?: string; text?: string; meta?: string };
};

type Props = {
  message: Message;
  isMine: boolean;
  isGroup?: boolean;
  formatTime?: Intl.DateTimeFormat | null;
  onDownloadAttachment?: (att: Attachment, senderId?: number) => void | Promise<void>;
  onResolveAttachmentUrl?: (att: Attachment, senderId?: number) => Promise<string>;
  theme?: Theme;
};

function parseCode(content: string | null): { isCode: boolean; language?: string; code?: string } {
  if (!content) return { isCode: false };
  const match = content.match(/^```\s*([a-zA-Z0-9+#_-]+)?\s*\n([\s\S]*?)\n```\s*$/);
  if (match) {
    const language = match[1]?.trim() || undefined;
    const code = match[2] ?? "";
    return { isCode: true, language, code };
  }
  return { isCode: false };
}

export const ChatMessage = memo(function ChatMessage({ message: m, isMine, isGroup, formatTime, onDownloadAttachment, onResolveAttachmentUrl, theme }: Props) {
  const parsed = parseCode(m.content ?? null);

  const mineBg = theme?.mine?.bg ?? "bg-secondary text-secondary-foreground";
  const mineText = theme?.mine?.text ?? "";
  const mineMeta = theme?.mine?.meta ?? "text-muted-foreground";
  const theirsBg = theme?.theirs?.bg ?? "bg-primary text-primary-foreground";
  const theirsText = theme?.theirs?.text ?? "";
  const theirsMeta = theme?.theirs?.meta ?? "text-primary-foreground/80";

  const isImageAttachment = useMemo(() => {
    const mime = m.attachment?.mime_type || "";
    return !!m.attachment && mime.startsWith("image/");
  }, [m.attachment]);
  const isVideoAttachment = useMemo(() => {
    const mime = m.attachment?.mime_type || "";
    return !!m.attachment && mime.startsWith("video/");
  }, [m.attachment]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(isImageAttachment || isVideoAttachment) || !m.attachment) {
        setPreviewUrl(null);
        setPreviewLoading(false);
        setPreviewError(null);
        return;
      }
      if (!onResolveAttachmentUrl) return;
      try {
        setPreviewLoading(true);
        setPreviewError(null);
        const url = await onResolveAttachmentUrl(m.attachment, m.sender?.id);
        if (!cancelled) setPreviewUrl(url);
      } catch {
        if (!cancelled) setPreviewError("failed");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [m.attachment, m.sender?.id, isImageAttachment, isVideoAttachment, onResolveAttachmentUrl]);

  return (
    <div className={`w-full flex ${isMine ? "justify-start" : "justify-end"}`}>
      {parsed.isCode ? (
        <div className={`inline-block rounded-2xl max-w-[85%] overflow-hidden ${isMine ? "rounded-br-none" : "rounded-bl-none"}`}>
          {isGroup && !isMine && m.sender?.username && (
            <div className="text-[11px] text-gray-500 px-3 pt-2">{m.sender.username}</div>
          )}
          <CodeBlockMessage content={m.content || ""} />
        </div>
      ) : (
        <div
          className={`inline-block px-3 py-2 rounded-2xl max-w-[75%] break-words break-all ${
            isMine ? `${mineBg} ${mineText} rounded-br-none` : `${theirsBg} ${theirsText} rounded-bl-none`
          }`}
        >
          {isGroup && !isMine && m.sender?.username && (
            <div className={`${isMine ? mineMeta : theirsMeta} text-[11px] mb-1`}>{m.sender.username}</div>
          )}
          {m.attachment ? (
            (isImageAttachment || isVideoAttachment) ? (
              <div className="space-y-1">
                {previewLoading && (
                  <div className="bg-black/5 rounded-md w-[320px] h-[200px] animate-pulse" />
                )}
                {previewError && (
                  <AttachmentMessage
                    attachment={m.attachment}
                    isMine={isMine}
                    onDownload={(att) => onDownloadAttachment?.(att, m.sender?.id)}
                  />
                )}
                {!previewLoading && !previewError && previewUrl && (
                  isImageAttachment ? (
                    <img
                      src={previewUrl}
                      alt={m.attachment.filename}
                      className="max-w-[320px] max-h-[240px] rounded-md block"
                      loading="lazy"
                    />
                  ) : (
                    <video
                      src={previewUrl}
                      className="max-w-[320px] max-h-[240px] rounded-md block"
                      controls
                      playsInline
                      autoPlay
                      muted
                      loop
                    />
                  )
                )}
              </div>
            ) : (
              <AttachmentMessage
                attachment={m.attachment}
                isMine={isMine}
                onDownload={(att) => onDownloadAttachment?.(att, m.sender?.id)}
              />
            )
          ) : (
            <div>{m.content ?? ""}</div>
          )}
          {m.timestamp && (
            <div className={`${isMine ? mineMeta : theirsMeta} text-[10px] mt-1 text-left`} dir="ltr">
              {formatTime
                ? formatTime.format(new Date(m.timestamp))
                : new Date(m.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});


