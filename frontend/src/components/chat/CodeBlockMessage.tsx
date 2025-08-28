import { memo, useMemo } from "react";

type Props = {
  content: string;
  onCopy?: (code: string) => void;
  label?: string;
};

export const CodeBlockMessage = memo(function CodeBlockMessage({ content, onCopy, label = "קוד" }: Props) {
  const parsed = useMemo(() => {
    const match = content.match(/^```\s*([a-zA-Z0-9+#_-]+)?\s*\n([\s\S]*?)\n```\s*$/);
    const language = match?.[1]?.trim() || undefined;
    const code = match?.[2] ?? content;
    return { language, code };
  }, [content]);

  return (
    <div className="inline-block rounded-2xl max-w-[85%] overflow-hidden">
      <div className="bg-gray-800 text-gray-100 text-xs px-3 py-1 font-mono flex items-center justify-between">
        <span>
          {label}
          {parsed.language ? ` · ${parsed.language}` : ""}
        </span>
        <button
          className="text-gray-300 hover:text-white"
          onClick={() => {
            try {
              if (onCopy) onCopy(parsed.code);
              else navigator.clipboard.writeText(parsed.code || "");
            } catch {}
          }}
        >
          העתק
        </button>
      </div>
      <pre dir="ltr" className="bg-gray-900 text-gray-100 text-sm p-3 overflow-x-auto font-mono whitespace-pre">
        <code>{parsed.code}</code>
      </pre>
    </div>
  );
});


