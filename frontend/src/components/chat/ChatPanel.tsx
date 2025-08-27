import { ReactNode } from "react"

type Props = {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export function ChatPanel({ title, actions, children, footer }: Props) {
  return (
    <div className="flex-1 min-h-0 min-w-0 max-w-[95%] flex flex-col rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="font-semibold text-base truncate">{title}</div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4">
        {children}
      </div>
      {footer && (
        <div className="p-4 border-t">
          {footer}
        </div>
      )}
    </div>
  )
}


