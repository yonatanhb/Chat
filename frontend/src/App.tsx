import { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { LoginForm } from "./components/LoginForm";
import { RegisterForm } from "./components/RegisterForm";
import { AuthenticatedApp } from "./components/AuthenticatedApp";
import { SettingsView } from "./components/SettingsView";
import { KeyImportView } from "./components/KeyImportView";
import { ResetAccountView } from "./components/ResetAccountView";
import { AdminPanel } from "./components/admin/AdminPanel";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { hasKeypair } from "@/lib/e2ee";

const PUBLIC_UNAUTH_PATHS = new Set([
  "/login",
  "/register",
  "/key-import",
  "/reset-account",
]);

function App() {
  const { token, isLoading, error, autoAuth, logout } = useAuth();
  const [authTried, setAuthTried] = useState(false);
  // Removed keypair bootstrap detection to simplify auth flow
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    autoAuth().finally(() => setAuthTried(true));
  }, [autoAuth]);

  // If unauthenticated and on /login without a local keypair, redirect to /register
  useEffect(() => {
    if (!token && location.pathname === "/login") {
      (async () => {
        const has = await hasKeypair().catch(() => false as const);
        if (!has) navigate("/register", { replace: true });
      })();
    }
  }, [token, location.pathname, navigate]);

  // Removed keypair-based redirects to avoid conflicting navigation

  // Hard guard: if logged out, force to /login (except public unauth paths)
  useEffect(() => {
    if (!authTried || isLoading) return;
    if (!token && !PUBLIC_UNAUTH_PATHS.has(location.pathname)) {
      navigate("/login", { replace: true });
    }
  }, [token, authTried, isLoading, location.pathname, navigate]);

  // During bootstrap, render a minimal splash to prevent login/register flip
  const bootstrapping = !authTried || isLoading;

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
                  <RegisterForm error={error} />
                </div>
              </div>
            )
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/admin"
        element={token ? <AdminPanel /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/settings"
        element={
          token ? (
            <SettingsView token={token} onLogout={logout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="/key-import" element={<KeyImportView />} />
      <Route path="/reset-account" element={<ResetAccountView />} />
      <Route
        path="/"
        element={
          token ? (
            <AuthenticatedApp token={token} onLogout={logout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
