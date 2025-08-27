import { useCallback, useMemo, useState } from "react";
import { adminLogin } from "../api";

export function useAdminAuth() {
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('admin_token'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (password: string) => {
    try {
      setLoading(true);
      setError(null);
      const { access_token } = await adminLogin(password);
      setAdminToken(access_token);
      localStorage.setItem('admin_token', access_token)
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Admin login failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setAdminToken(null)
    localStorage.removeItem('admin_token')
  }, []);

  return useMemo(() => ({ adminToken, loading, error, login, logout }), [adminToken, loading, error, login, logout]);
}


