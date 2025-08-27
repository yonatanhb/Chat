import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRef, useState } from "react"
import { FileCode, X, Paperclip } from "lucide-react"

type Props = {
  value: string
  onChange: (v: string) => void
  onSend: (e: React.FormEvent) => void
  disabled?: boolean
  onSendCode?: (code: string, language?: string) => Promise<void> | void
  onSendAttachment?: (file: File) => Promise<void> | void
}

export function ChatInput({ value, onChange, onSend, disabled, onSendCode, onSendAttachment }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [codeText, setCodeText] = useState("")
  const [lang, setLang] = useState("")
  return (
    <>
      <form onSubmit={onSend} className="mt-3 flex gap-2 items-center">
        <Input
          ref={inputRef}
          className="flex-1"
          placeholder={disabled ? "בחר צ'אט כדי לשלוח" : "הקלד הודעה…"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <input type="file" ref={fileRef} hidden onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f && onSendAttachment) {
            await onSendAttachment(f)
            try { if (fileRef.current) fileRef.current.value = "" } catch {}
          }
        }} />
        <Button type="button" variant="outline" disabled={disabled} onClick={() => fileRef.current?.click()} aria-label="צרף קובץ">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button type="submit" disabled={disabled || !value.trim()}>שליחה</Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => setShowCode(true)} aria-label="שליחת קוד">
          <FileCode className="h-4 w-4" />
        </Button>
      </form>

      {showCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCode(false)} />
          <div className="relative bg-white rounded-lg shadow w-full max-w-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">שליחת קוד</div>
              <button onClick={() => setShowCode(false)} aria-label="סגור"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-2 mb-2">
              <Input placeholder="שפת קוד (למשל: ts, js, py)" value={lang} onChange={(e) => setLang(e.target.value)} />
            </div>
            <textarea
              dir="ltr"
              className="w-full h-64 border rounded p-2 font-mono text-sm text-left placeholder:text-right"
              placeholder={"...הדבק/כתוב קוד כאן"}
              value={codeText}
              onChange={(e) => setCodeText(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="ghost" type="button" onClick={() => setShowCode(false)}>בטל</Button>
              <Button type="button" onClick={async () => {
                if (!onSendCode) return
                const code = codeText.trim()
                if (!code) return
                await onSendCode(code, lang.trim() || undefined)
                setShowCode(false)
                setCodeText("")
                setLang("")
              }}>שלח קוד</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


