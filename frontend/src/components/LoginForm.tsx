import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { hasKeypair } from "@/lib/e2ee";

type Props = { error: string | null; forceMode?: 'login' | 'register' };

export function LoginForm({ error, forceMode }: Props) {
  const { register, loginWithPassword, isLoading } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>(forceMode ?? 'register')
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      try {
        const has = await hasKeypair()
        if (!forceMode) setMode(has ? 'login' : 'register')
      } catch {}
    })()
  }, [forceMode])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'login' ? 'כניסה' : 'הרשמה'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <div className="text-sm text-destructive">שגיאה: {error}</div>}
        {formError && <div className="text-sm text-destructive">{formError}</div>}
        {mode === 'register' && (
          <>
            <Input placeholder="שם משתמש" value={username} onChange={(e) => setUsername(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="שם פרטי" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input placeholder="שם משפחה" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            {/* phone field removed */}
          </>
        )}
        {mode === 'login' && (
          <div className="text-sm text-muted-foreground">שכחת סיסמא? באסה לך</div>
        )}
        <Input type="password" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex gap-2">
          {mode === 'login' ? (
            <Button className="w-full" disabled={isLoading} onClick={async () => { await loginWithPassword(password) }}>כניסה</Button>
          ) : (
            <Button className="w-full" disabled={isLoading} onClick={async () => {
              if (!username.trim() || !firstName.trim() || !lastName.trim() || !password.trim()) {
                setFormError('נא למלא את כל השדות')
                return
              }
              setFormError(null)
              const ok = await register({ username, first_name: firstName, last_name: lastName, password })
              if (ok) navigate('/login', { replace: true })
            }}>הרשמה</Button>
          )}
          {/* toggle removed per request */}
        </div>
      </CardContent>
    </Card>
  );
}


