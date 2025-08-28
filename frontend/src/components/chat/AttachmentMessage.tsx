import { memo, useState } from "react";
import type { Attachment } from "@/types/chat";

type Props = {
  attachment: Attachment;
  isMine?: boolean;
  onDownload?: (att: Attachment) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
};

export const AttachmentMessage = memo(function AttachmentMessage({ attachment, isMine, onDownload }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs truncate max-w-[220px]" title={attachment.filename}>
        {attachment.filename}
      </span>
      <button
        aria-label="הורדה"
        disabled={busy}
        className={`text-current hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 p-1 rounded disabled:opacity-60`}
        onClick={async () => {
          if (!onDownload) return;
          try {
            setBusy(true);
            await onDownload(attachment);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M12 3a1 1 0 0 1 1 1v8.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4.001 4a1 1 0 0 1-1.412 0l-4.001-4a1 1 0 0 1 1.414-1.414L11 12.586V4a1 1 0 0 1 1-1z" />
            <path d="M5 20a1 1 0 1 1 0-2h14a1 1 0 1 1 0 2H5z" />
          </svg>
        )}
      </button>
    </div>
  );
});


