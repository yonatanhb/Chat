import { ReactNode, useEffect, useRef, useState } from "react";

type Props = {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onDropFiles?: (files: FileList) => void;
};

export function ChatPanel({
  title,
  actions,
  children,
  footer,
  onDropFiles,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length && onDropFiles) onDropFiles(files);
    };
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [onDropFiles]);
  return (
    <div
      ref={panelRef}
      className="relative flex-1 min-h-0 min-w-0 max-w-[95%] flex flex-col rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden"
    >
      <div className="flex items-center justify-between p-4 border-b">
        <div className="font-semibold text-base truncate">{title}</div>
        {actions && (
          <div className="shrink-0 flex items-center gap-2">{actions}</div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4">
        {children}
      </div>
      {footer && <div className="p-4 border-t">{footer}</div>}
      {dragOver && (
        <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-md bg-white/90 border text-sm">
            שחרר כאן כדי לצרף קובץ
          </div>
        </div>
      )}
    </div>
  );
}
