import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { createEncryptedBackup } from "@/lib/e2ee";
import { Shield, KeyRound, ArrowLeft, Download, SunMoon } from "lucide-react";

type Props = {
  token: string;
  onLogout: () => void;
};

export function SettingsView({ onLogout }: Props) {
  const navigate = useNavigate();
  return (
    <div className="w-screen h-screen overflow-hidden bg-background text-foreground grid grid-cols-1 min-h-0 box-border p-6">
      <div className="max-w-3xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold inline-flex items-center gap-2">
            <Shield className="h-6 w-6" />
            הגדרות
          </h1>
          <div className="inline-flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/")}> 
              <ArrowLeft className="h-4 w-4 ml-1" /> חזרה לצ'אט
            </Button>
            <Button variant="outline" onClick={onLogout}>יציאה</Button>
          </div>
        </div>

        <section className="rounded-lg border p-4 space-y-3">
          <div className="font-medium inline-flex items-center gap-2">
            <SunMoon className="h-4 w-4" /> מצב תצוגה
          </div>
          <div className="text-sm text-muted-foreground">בחר מצב תצוגה: בהיר / כהה / מערכת</div>
          <ThemeToggle />
        </section>

        <section className="rounded-lg border p-4 space-y-3">
          <div className="font-medium inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> גיבוי מפתח ההצפנה
          </div>
          <div className="text-sm leading-6 bg-muted/40 rounded-md p-3 border">
            זהירות: ייצוא המפתח מאפשר לכל מי שמחזיק בקובץ ובסיסמה לפענח הודעות ישנות. שמור/י את הקובץ במקום בטוח, אל תשלח/י אותו בוואטסאפ של המשפחה.
          </div>
          <div>
            <Button
              onClick={async () => {
                try {
                  const backup = await createEncryptedBackup();
                  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `chat-key-backup-${new Date().toISOString().slice(0,10)}.json`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                } catch (e: any) {
                  alert(e?.message || "Export failed");
                }
              }}
            >
              <Download className="h-4 w-4 ml-1" /> ייצוא מפתח מוצפן (JSON)
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}


