import { Fragment, useEffect, useMemo, useRef } from "react"

type Message = { id: number; content: string | null; sender?: { id: number; username: string }; timestamp?: string }

type Props = {
  messages: Message[]
  firstUnreadIndex: number
  myId?: number | null
  isGroup?: boolean
}

export function ChatMessages({ messages, firstUnreadIndex, myId, isGroup }: Props) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const formatTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    } catch {
      return null
    }
  }, [])
  const weekdayFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('he-IL', { weekday: 'long' })
    } catch {
      return null
    }
  }, [])
  const dateFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    anchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  function parseCode(content: string | null): { isCode: boolean; language?: string; code?: string } {
    if (!content) return { isCode: false }
    const match = content.match(/^```\s*([a-zA-Z0-9+#_-]+)?\s*\n([\s\S]*?)\n```\s*$/)
    if (match) {
      const language = match[1]?.trim() || undefined
      const code = match[2] ?? ''
      return { isCode: true, language, code }
    }
    return { isCode: false }
  }

  return (
    <div className="w-full max-w-full flex-1 overflow-y-auto space-y-2 pr-2 pl-2 box-border">
      {(() => {
        // Helpers for day grouping
        const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x }
        const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
        const labelFor = (date: Date): string => {
          const today = startOfDay(new Date())
          const d0 = startOfDay(date)
          const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
          if (isSameDay(d0, today)) return 'היום'
          if (isSameDay(d0, yesterday)) return 'אתמול'
          const sevenAgo = new Date(today); sevenAgo.setDate(today.getDate() - 7)
          const weekday = weekdayFmt ? weekdayFmt.format(date) : date.toLocaleDateString('he-IL', { weekday: 'long' } as any)
          if (d0 > sevenAgo) return weekday
          const full = dateFmt ? dateFmt.format(date) : date.toLocaleDateString('he-IL')
          return `${weekday}, ${full}`
        }
        let lastDayKey: string | null = null
        return messages.map((m, idx) => {
          const isMine = myId != null && m.sender?.id === myId
          const parsed = parseCode(m.content ?? null)
          const ts = m.timestamp ? new Date(m.timestamp) : null
          const dayKey = ts ? `${ts.getFullYear()}-${ts.getMonth()+1}-${ts.getDate()}` : `idx-${idx}`
          const showDateLabel = ts != null && dayKey !== lastDayKey
          if (showDateLabel) lastDayKey = dayKey
          return (
            <Fragment key={m.id}>
              {showDateLabel && ts && (
                <div className="text-center text-xs text-muted-foreground my-3">— {labelFor(ts)} —</div>
              )}
              {firstUnreadIndex === idx && (
                <div className="text-center text-xs text-muted-foreground my-2">— הודעות שלא נקראו —</div>
              )}
              <div className={`w-full flex ${isMine ? 'justify-start' : 'justify-end'}`}>
                {parsed.isCode ? (
                  <div className={`inline-block rounded-2xl max-w-[85%] overflow-hidden ${isMine ? 'rounded-br-none' : 'rounded-bl-none'}`}>
                    {isGroup && !isMine && m.sender?.username && (
                      <div className="text-[11px] text-gray-500 px-3 pt-2">{m.sender.username}</div>
                    )}
                    <div className="bg-gray-800 text-gray-100 text-xs px-3 py-1 font-mono flex items-center justify-between">
                      <span>קוד{parsed.language ? ` · ${parsed.language}` : ''}</span>
                      <button
                        className="text-gray-300 hover:text-white"
                        onClick={() => {
                          try { navigator.clipboard.writeText(parsed.code || '') } catch {}
                        }}
                      >העתק</button>
                    </div>
                    <pre dir="ltr" className="bg-gray-900 text-gray-100 text-sm p-3 overflow-x-auto font-mono whitespace-pre">
                      <code>{parsed.code}</code>
                    </pre>
                  </div>
                ) : (
                  <div className={`inline-block px-3 py-2 rounded-2xl max-w-[75%] break-words break-all ${isMine ? 'bg-gray-100 text-gray-900 rounded-br-none' : 'bg-blue-600 text-white rounded-bl-none'}`}>
                    {isGroup && !isMine && m.sender?.username && (
                      <div className={`${isMine ? 'text-gray-500' : 'text-white/80'} text-[11px] mb-1`}>{m.sender.username}</div>
                    )}
                    <div>{m.content ?? ''}</div>
                    {m.timestamp && (
                      <div className={`${isMine ? 'text-gray-500' : 'text-white/80'} text-[10px] mt-1 text-left`} dir="ltr">
                        {(formatTime ? formatTime.format(new Date(m.timestamp)) : new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Fragment>
          )
        })
      })()}
      <div ref={anchorRef} />
    </div>
  )
}


