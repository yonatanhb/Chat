import * as React from "react"

export function Sidebar({ children }: { children: React.ReactNode }) {
  return (
    <aside className="border-l bg-white h-full flex flex-col w-[320px]">
      {children}
    </aside>
  )
}

export function SidebarHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3 border-b">{children}</div>
}

export function SidebarContent({ children }: { children: React.ReactNode }) {
  return <div className="p-4 space-y-4 overflow-y-auto">{children}</div>
}

export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto px-4 py-3 border-t">{children}</div>
}

export function SidebarGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>
}

export function SidebarGroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium text-gray-700">{children}</div>
}

export function SidebarGroupContent({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>
}


