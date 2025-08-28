import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { KeyRound, ArrowLeft, Upload } from "lucide-react";
import { importEncryptedBackup } from "@/lib/e2ee";

export function KeyImportView() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="w-screen h-screen overflow-hidden bg-background text-foreground grid grid-cols-1 min-h-0 box-border p-6">
      <div className="max-w-lg w-full mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold inline-flex items-center gap-2">
            <KeyRound className="h-6 w-6" /> ייבוא מפתח מגיבוי
          </h1>
          <Button variant="ghost" onClick={() => navigate("/login")}>
            <ArrowLeft className="h-4 w-4 ml-1" /> חזרה
          </Button>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="text-sm text-muted-foreground">בחר/י קובץ JSON שהורד מ"ייצוא מפתח" והכנס/י סיסמה לפענוח.</div>
          <input type="file" accept="application/json" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <Input type="password" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate("/login")}>בטל</Button>
            <Button
              disabled={!file || !password || busy}
              onClick={async () => {
                if (!file) return;
                setError(null);
                setBusy(true);
                try {
                  const text = await file.text();
                  const backup = JSON.parse(text);
                  await importEncryptedBackup(password, backup);
                  navigate("/login", { replace: true });
                } catch (e: any) {
                  setError(e?.message || "ייבוא נכשל");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Upload className="h-4 w-4 ml-1" /> ייבוא
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


