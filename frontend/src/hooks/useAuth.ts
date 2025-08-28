import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, registerAccount as apiRegister, loginWithKey as apiLoginWithKey } from "../api";
import { generateKeypair, persistKeypair, loadPrivateKeyFromPassword, getStoredPublicJwk } from "@/lib/e2ee";

export function useAuth() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("chat_token")
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveToken = useCallback((t: string | null) => {
    if (t) localStorage.setItem("chat_token", t);
    else localStorage.removeItem("chat_token");
    setToken(t);
    try { window.dispatchEvent(new Event('auth-changed')); } catch {}
  }, []);

  const autoAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // If JWT present, validate it; otherwise ensure no ghost token
      const current = token ?? localStorage.getItem("chat_token");
      if (current) {
        const me = await fetch(`${API_BASE}/users/me/`, { headers: { Authorization: `Bearer ${current}` } });
        if (me.ok) {
          saveToken(current);
          return;
        } else {
          saveToken(null);
          return;
        }
      }
      // No token: do not auto-auth; just ensure state is clean
      saveToken(null);
    } catch (e: any) {
      setError(e?.message ?? "Auto-auth failed");
    } finally {
      setIsLoading(false);
    }
  }, [saveToken, token]);

  // Sync token across components/tabs
  useEffect(() => {
    const handler = () => {
      const current = localStorage.getItem('chat_token')
      setToken(current)
    }
    window.addEventListener('storage', handler)
    window.addEventListener('auth-changed', handler as any)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('auth-changed', handler as any)
    }
  }, [])

  const register = useCallback(async (payload: { username: string; first_name?: string; last_name?: string; password: string }): Promise<{ ok: boolean; message?: string }> => {
    setIsLoading(true)
    setError(null)
    try {
      // 1) Generate keypair in-memory only
      const { privateJwk, publicJwk } = await generateKeypair()
      // 2) Attempt to register with public key
      await apiRegister({ ...payload, public_key_jwk: JSON.stringify(publicJwk) })
      // 3) Only if registration succeeds, persist keys locally
      await persistKeypair(payload.password, privateJwk, publicJwk)
      // Do not auto-login after register; caller decides navigation
      return { ok: true }
    } catch (e: any) {
      const msg = e?.message ?? 'Registration failed'
      setError(msg)
      return { ok: false, message: msg }
    } finally {
      setIsLoading(false)
    }
  }, [saveToken])

  const loginWithPassword = useCallback(async (password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      await loadPrivateKeyFromPassword(password)
      const publicJwk = await getStoredPublicJwk()
      if (!publicJwk) throw new Error('Missing public key')
      const res = await apiLoginWithKey({ public_key_jwk: JSON.stringify(publicJwk), password })
      saveToken(res.access_token)
      return true
    } catch (e: any) {
      setError(e?.message ?? 'Login failed')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [saveToken])

  // Global fetch interceptor for 401 to force logout
  useEffect(() => {
    const origFetch = window.fetch
    // @ts-ignore
    window.fetch = async (input: RequestInfo, init?: RequestInit) => {
      const resp = await origFetch(input, init)
      if (resp.status === 401) {
        saveToken(null)
      }
      return resp
    }
    return () => {
      // @ts-ignore
      window.fetch = origFetch
    }
  }, [saveToken])

  const logout = useCallback(() => {
    saveToken(null);
  }, [saveToken]);

  return useMemo(
    () => ({ token, isLoading, error, autoAuth, logout, register, loginWithPassword }),
    [token, isLoading, error, autoAuth, logout, register, loginWithPassword]
  );
}


