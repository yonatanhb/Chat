import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { getMe } from "@/api"
import { useAuth } from "@/hooks/useAuth"

type CurrentUser = {
  id: number
  username: string
  role: string
  first_name?: string | null
  last_name?: string | null
}

type UserContextValue = {
  user: CurrentUser | null
  token: string | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const Ctx = createContext<UserContextValue | null>(null)

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { token, error: authError } = useAuth()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) { setUser(null); return }
    try {
      setLoading(true)
      setError(null)
      const me = await getMe(token)
      setUser(me as any)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load user')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    // fetch on token change
    refresh()
  }, [refresh])

  const value = useMemo<UserContextValue>(() => ({ user, token, loading, error: error ?? authError ?? null, refresh }), [user, token, loading, error, authError, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useUser() {
  const ctx = useContext(Ctx)
  return ctx
}


