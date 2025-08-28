import { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { LoginForm } from "./components/LoginForm";
import { AuthenticatedApp } from "./components/AuthenticatedApp";
import { SettingsView } from "./components/SettingsView";
import { KeyImportView } from "./components/KeyImportView";
import { ResetAccountView } from "./components/ResetAccountView";
import { AdminPanel } from "./components/admin/AdminPanel";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { hasKeypair } from "@/lib/e2ee";

function App() {
  const { token, isLoading, error, autoAuth, logout } = useAuth();
  const [authTried, setAuthTried] = useState(false);
  const [keyCheckDone, setKeyCheckDone] = useState(false);
  const [hasLocalKeypair, setHasLocalKeypair] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    autoAuth().finally(() => setAuthTried(true));
  }, [autoAuth]);

  // Pre-check if local keypair exists to avoid UI flicker between /login and /register
  useEffect(() => {
    (async () => {
      try {
        const has = await hasKeypair().catch(() => false as const);
        setHasLocalKeypair(has);
      } finally {
        setKeyCheckDone(true);
      }
    })();
  }, []);
  // Redirect to /register if no JWT and no local keypair; otherwise keep /login
  useEffect(() => {
    if (!authTried || isLoading || !keyCheckDone) return;
    if (token) return;
    const has = !!hasLocalKeypair;
    if (
      !has &&
      location.pathname !== "/register" &&
      location.pathname !== "/key-import" &&
      location.pathname !== "/reset-account"
    ) {
      navigate("/register", { replace: true });
    }
    if (has && location.pathname === "/register") {
      navigate("/login", { replace: true });
    }
  }, [authTried, isLoading, token, keyCheckDone, hasLocalKeypair, navigate, location.pathname]);

  // Hard guard: if logged out, force to /login (except on /login or /register)
  useEffect(() => {
    if (!authTried || isLoading || !keyCheckDone) return;
    if (
      !token &&
      location.pathname !== "/login" &&
      location.pathname !== "/register" &&
      location.pathname !== "/key-import" &&
      location.pathname !== "/reset-account"
    ) {
      navigate("/login", { replace: true });
    }
  }, [token, authTried, isLoading, keyCheckDone, location.pathname, navigate]);


  // During bootstrap, render a minimal splash to prevent login/register flip
  const bootstrapping = !authTried || isLoading || !keyCheckDone;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          !token ? (
            bootstrapping ? (
              <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
                <div className="w-full max-w-md animate-pulse">
                  <div className="h-10 bg-muted rounded mb-4" />
                  <div className="h-32 bg-muted rounded" />
                </div>
              </div>
            ) : (
              <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
                <div className="w-full max-w-md">
                  <LoginForm error={error} />
                </div>
              </div>
            )
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/register"
        element={
          !token ? (
            bootstrapping ? (
              <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
                <div className="w-full max-w-md animate-pulse">
                  <div className="h-10 bg-muted rounded mb-4" />
                  <div className="h-32 bg-muted rounded" />
                </div>
              </div>
            ) : (
              <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
                <div className="w-full max-w-md">
                  <LoginForm error={error} forceMode="register" />
                </div>
              </div>
            )
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="/admin" element={token ? <AdminPanel /> : <Navigate to="/login" replace />} />
      <Route path="/settings" element={token ? <SettingsView token={token} onLogout={logout} /> : <Navigate to="/login" replace />} />
      <Route path="/key-import" element={<KeyImportView />} />
      <Route path="/reset-account" element={<ResetAccountView />} />
      <Route path="/" element={token ? <AuthenticatedApp token={token} onLogout={logout} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App
