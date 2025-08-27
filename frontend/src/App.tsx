import { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { LoginForm } from "./components/LoginForm";
import { AuthenticatedApp } from "./components/AuthenticatedApp";
import { AdminPanel } from "./components/admin/AdminPanel";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { hasKeypair } from "@/lib/e2ee";

function App() {
  const { token, isLoading, error, autoAuth, logout } = useAuth();
  const [authTried, setAuthTried] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    autoAuth().finally(() => setAuthTried(true));
  }, [autoAuth]);
  // Redirect to /register if no JWT and no local keypair; otherwise keep /login
  useEffect(() => {
    (async () => {
      if (!authTried || isLoading) return;
      if (token) return;
      const has = await hasKeypair().catch(() => false as const);
      if (!has && location.pathname !== "/register") {
        navigate("/register", { replace: true });
      }
      if (has && location.pathname === "/register") {
        navigate("/login", { replace: true });
      }
    })();
  }, [authTried, isLoading, token, navigate, location.pathname]);

  // Hard guard: if logged out, force to /login (except on /login or /register)
  useEffect(() => {
    if (!authTried || isLoading) return;
    if (!token && location.pathname !== "/login" && location.pathname !== "/register") {
      navigate("/login", { replace: true });
    }
  }, [token, authTried, isLoading, location.pathname, navigate]);


  return (
    <Routes>
      <Route
        path="/login"
        element={
          !token ? (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
              <div className="w-full max-w-md">
                <LoginForm error={error} />
              </div>
            </div>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/register"
        element={
          !token ? (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
              <div className="w-full max-w-md">
                <LoginForm error={error} forceMode="register" hideToggle />
              </div>
            </div>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="/admin" element={token ? <AdminPanel /> : <Navigate to="/login" replace />} />
      <Route path="/" element={token ? <AuthenticatedApp token={token} onLogout={logout} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App
