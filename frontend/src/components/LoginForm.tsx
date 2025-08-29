import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";

type Props = { error: string | null };

export function LoginForm({ error }: Props) {
  const { loginWithPassword, isLoading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>כניסה</CardTitle>
        <ThemeToggle />
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="text-sm text-destructive">שגיאה: {error}</div>
        )}
        <div className="text-sm text-muted-foreground">
          שכחת סיסמה?{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => navigate("/reset-account")}
          >
            לחץ כאן לאיפוס חשבון
          </button>
        </div>
        <Input
          type="password"
          placeholder="סיסמה"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            className="w-full"
            disabled={isLoading}
            onClick={async () => {
              await loginWithPassword(password);
            }}
          >
            כניסה
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
