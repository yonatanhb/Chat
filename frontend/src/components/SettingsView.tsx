import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { createEncryptedBackup } from "@/lib/e2ee";
import {
  Shield,
  KeyRound,
  ArrowLeft,
  Download,
  SunMoon,
  Pin,
} from "lucide-react";
import { useState, useEffect } from "react";
import { getUserSettings, updateUserSettings } from "@/api";
import { Input } from "./ui/input";
import { toast } from "sonner";

type Props = {
  token: string;
  onLogout: () => void;
};

export function SettingsView({ token, onLogout }: Props) {
  const navigate = useNavigate();
  const [pinnedChatsLimit, setPinnedChatsLimit] = useState<number>(3);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getUserSettings(token);
        setPinnedChatsLimit(settings.pinned_chats_limit);
      } catch (error) {
        console.error("Failed to load settings:", error);
        toast.error("שגיאה בטעינת הגדרות");
      }
    };

    loadSettings();
  }, [token]);

  const handleUpdateSettings = async () => {
    if (pinnedChatsLimit < 1 || pinnedChatsLimit > 5) {
      toast.error("מספר הצ'אטים המועדפים חייב להיות בין 1 ל-5");
      return;
    }

    setIsUpdating(true);
    try {
      await updateUserSettings(token, { pinned_chats_limit: pinnedChatsLimit });
      toast.success("ההגדרות עודכנו בהצלחה");
    } catch (error: any) {
      toast.error(error.message || "שגיאה בעדכון ההגדרות");
    } finally {
      setIsUpdating(false);
    }
  };

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
            <Button variant="outline" onClick={onLogout}>
              יציאה
            </Button>
          </div>
        </div>

        <section className="rounded-lg border p-4 space-y-3">
          <div className="font-medium inline-flex items-center gap-2">
            <SunMoon className="h-4 w-4" /> מצב תצוגה
          </div>
          <div className="text-sm text-muted-foreground">
            בחר מצב תצוגה: בהיר / כהה / מערכת
          </div>
          <ThemeToggle />
        </section>

        <section className="rounded-lg border p-4 space-y-3">
          <div className="font-medium inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> גיבוי מפתח ההצפנה
          </div>
          <div className="text-sm leading-6 bg-muted/40 rounded-md p-3 border">
            זהירות: ייצוא המפתח מאפשר לכל מי שמחזיק בקובץ ובסיסמה לפענח הודעות
            ישנות. שמור/י את הקובץ במקום בטוח, אל תשלח/י אותו בוואטסאפ של
            המשפחה.
          </div>
          <div>
            <Button
              onClick={async () => {
                try {
                  const backup = await createEncryptedBackup();
                  const blob = new Blob([JSON.stringify(backup, null, 2)], {
                    type: "application/json",
                  });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `chat-key-backup-${new Date()
                    .toISOString()
                    .slice(0, 10)}.json`;
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

        <section className="rounded-lg border p-4 space-y-3">
          <div className="font-medium inline-flex items-center gap-2">
            <Pin className="h-4 w-4" /> הגדרות צ'אטים מועדפים
          </div>
          <div className="text-sm text-muted-foreground">
            הגדר את המספר המקסימלי של צ'אטים שניתן לנעוץ (בין 1 ל-5)
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min="1"
              max="5"
              value={pinnedChatsLimit}
              onChange={(e) =>
                setPinnedChatsLimit(parseInt(e.target.value) || 3)
              }
              className="w-24"
            />
            <Button
              onClick={handleUpdateSettings}
              disabled={isUpdating}
              variant="outline"
            >
              {isUpdating ? "מעדכן..." : "עדכן הגדרות"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
